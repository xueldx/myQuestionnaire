import OpenAI from 'openai';
import {
  CopilotRuntimePhase,
  CopilotWorkflowStage,
  DraftSummary,
  QuestionnaireDraft,
} from '@/service/ai/dto/copilot-stream.dto';
import { parseCopilotBlocks } from '@/service/ai/utils/parse-copilot-blocks';
import { normalizeDraft } from '@/service/ai/utils/draft-normalizer';
import {
  getFocusedQuestionBinding,
  getReferencedQuestionBindings,
  instructionAllowsAdditions,
} from '@/service/ai/utils/question-reference';
import { validateDraft } from '@/service/ai/utils/draft-validator';
import { buildDiffSummary } from '@/service/ai/utils/build-diff-summary';
import { SanitizedCopilotDto } from '@/service/ai/ai-copilot-sanitize';
import {
  getWorkflowStage,
  ModelRuntimeConfig,
} from '@/service/ai/ai-copilot-request-context';
import { CopilotEventSink } from '@/service/ai/ai-copilot-tools';
import { sanitizeAssistantReply } from '@/service/ai/utils/sanitize-assistant-reply';

const isQuestionComponentChanged = (
  prev: QuestionnaireDraft['components'][number],
  next: QuestionnaireDraft['components'][number],
) => {
  return (
    prev.title !== next.title ||
    prev.type !== next.type ||
    JSON.stringify(prev.props || {}) !== JSON.stringify(next.props || {})
  );
};

const extractProviderUsage = (chunk: any) => {
  const usage = chunk?.usage;
  if (!usage || typeof usage !== 'object') return null;
  return usage as Record<string, any>;
};

export const emitCopilotPhase = (
  sink: CopilotEventSink,
  currentPhaseRef: { current: CopilotRuntimePhase | null },
  phase: CopilotRuntimePhase,
  stage: CopilotWorkflowStage,
) => {
  if (currentPhaseRef.current === phase) return;
  currentPhaseRef.current = phase;
  sink.emit('phase', {
    phase,
    stage,
  });
};

const emitAssistantReplyChunks = async (
  sink: CopilotEventSink,
  reply: string,
  options?: {
    chunkSize?: number;
    delayMs?: number;
    shouldStop?: () => boolean;
  },
) => {
  const normalizedReply = reply.trim();
  if (!normalizedReply) return;

  const chunkSize = options?.chunkSize ?? 10;
  const delayMs = options?.delayMs ?? 24;

  for (let start = 0; start < normalizedReply.length; start += chunkSize) {
    if (options?.shouldStop?.()) break;
    const delta = normalizedReply.slice(start, start + chunkSize);
    if (!delta) continue;
    sink.emit('assistant_delta', { delta });

    if (start + chunkSize < normalizedReply.length && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
};

export const streamPromptRefine = async (
  prompt: string,
  client: OpenAI,
  modelConfig: ModelRuntimeConfig,
  abortController: AbortController,
  sink: CopilotEventSink,
  shouldStop: () => boolean,
  shouldEmitChunks?: () => boolean,
): Promise<{
  refinedPrompt: string;
  reply: string;
  providerUsage: Record<string, any> | null;
} | null> => {
  let refinedPrompt = '';
  let providerUsage: Record<string, any> | null = null;
  const currentPhaseRef: { current: CopilotRuntimePhase | null } = {
    current: null,
  };

  emitCopilotPhase(sink, currentPhaseRef, 'polishing', 'polish');

  const stream = await client.chat.completions.create(
    {
      model: modelConfig.model,
      stream: true,
      messages: [
        {
          role: 'system',
          content:
            '你是严谨的问卷 Prompt 润色助手，只输出可直接用于问卷生成的最终 Prompt 正文。',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      stream_options: {
        include_usage: true,
      },
    },
    {
      signal: abortController.signal,
    },
  );

  for await (const chunk of stream) {
    if (shouldStop()) break;

    providerUsage = extractProviderUsage(chunk) || providerUsage;
    const content = chunk.choices[0]?.delta?.content || '';
    if (!content) continue;

    refinedPrompt += content;
    sink.emit('prompt_delta', { delta: content });
  }

  if (shouldStop()) return null;

  const finalPrompt = refinedPrompt.trim();
  if (!finalPrompt) {
    throw new Error('AI 未生成可确认的润色 Prompt，请重试');
  }

  const reply = 'Prompt 润色完成，已回填到输入框，可继续编辑或直接发送。';
  emitCopilotPhase(sink, currentPhaseRef, 'answering', 'polish');
  await emitAssistantReplyChunks(sink, reply, {
    shouldStop: shouldEmitChunks,
  });
  if (shouldStop()) return null;
  sink.emit('prompt_refined', {
    prompt: finalPrompt,
    reply,
  });
  sink.emit('done', {
    ok: true,
    stage: 'polish',
  });
  return {
    refinedPrompt: finalPrompt,
    reply,
    providerUsage,
  };
};

export const streamDraftStage = async (
  prompt: string,
  dto: SanitizedCopilotDto,
  client: OpenAI,
  modelConfig: ModelRuntimeConfig,
  abortController: AbortController,
  sink: CopilotEventSink,
  shouldStop: () => boolean,
  options?: {
    onPhaseChange?: (phase: CopilotRuntimePhase) => Promise<void> | void;
    onCheckpoint?: (payload: {
      draft: QuestionnaireDraft;
      runtimeStatus: CopilotRuntimePhase;
    }) => Promise<void> | void;
  },
): Promise<{
  reply: string;
  draft: QuestionnaireDraft;
  summary: DraftSummary;
  warningCount: number;
  providerUsage: Record<string, any> | null;
  completionText: string;
} | null> => {
  const workflowStage = getWorkflowStage(dto);
  let accumulatedContent = '';
  let lastAssistantReply = '';
  let lastDraftSignature = '';
  let lastWarningSignature = '';
  let warningCount = 0;
  let providerUsage: Record<string, any> | null = null;
  const currentPhaseRef: { current: CopilotRuntimePhase | null } = {
    current: null,
  };

  emitCopilotPhase(sink, currentPhaseRef, 'thinking', workflowStage);
  await options?.onPhaseChange?.('thinking');

  const emitParserWarning = (parsedWarningList: string[]) => {
    if (parsedWarningList.length === 0) return;

    const nextSignature = parsedWarningList.join('|');
    if (nextSignature === lastWarningSignature) return;

    lastWarningSignature = nextSignature;
    sink.emit('warning', {
      code: 'PARTIAL_COMPONENT_PARSE_SKIPPED',
      message: `AI 输出里有 ${parsedWarningList.length} 个组件块解析失败，已自动跳过，已解析成功的内容仍可继续预览和应用。`,
    });
  };

  const stream = await client.chat.completions.create(
    {
      model: modelConfig.model,
      stream: true,
      messages: [
        {
          role: 'system',
          content: '你是严谨的问卷编辑 Copilot，只输出协议规定的块内容。',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      stream_options: {
        include_usage: true,
      },
    },
    {
      signal: abortController.signal,
    },
  );

  for await (const chunk of stream) {
    if (shouldStop()) break;

    providerUsage = extractProviderUsage(chunk) || providerUsage;
    const content = chunk.choices[0]?.delta?.content || '';
    if (!content) continue;

    accumulatedContent += content;
    const parsed = parseCopilotBlocks(accumulatedContent);
    emitParserWarning(parsed.warnings);

    const nextAssistantReply = sanitizeAssistantReply(parsed.assistantReply);

    if (
      nextAssistantReply.length >= lastAssistantReply.length &&
      nextAssistantReply.startsWith(lastAssistantReply)
    ) {
      const delta = nextAssistantReply.slice(lastAssistantReply.length);
      lastAssistantReply = nextAssistantReply;

      if (delta) {
        emitCopilotPhase(sink, currentPhaseRef, 'answering', workflowStage);
        await options?.onPhaseChange?.('answering');
        sink.emit('assistant_delta', { delta });
      }
    } else if (nextAssistantReply !== lastAssistantReply) {
      lastAssistantReply = nextAssistantReply;
    }

    if (parsed.pageConfig || parsed.components.length > 0) {
      const draftPartial = normalizeDraft(
        parsed,
        dto.questionnaire,
        dto.intent,
        dto.instruction,
        dto.focusedComponentId,
      );
      const signature = JSON.stringify(draftPartial);

      if (signature !== lastDraftSignature) {
        lastDraftSignature = signature;
        emitCopilotPhase(sink, currentPhaseRef, 'drafting', workflowStage);
        await options?.onPhaseChange?.('drafting');
        sink.emit('draft_partial', {
          draft: draftPartial,
          progress: {
            componentsParsed: draftPartial.components.length,
          },
        });
        await options?.onCheckpoint?.({
          draft: draftPartial,
          runtimeStatus: 'drafting',
        });
      }
    }
  }

  if (shouldStop()) return null;

  const parsed = parseCopilotBlocks(accumulatedContent);
  emitParserWarning(parsed.warnings);

  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors[0]);
  }

  if (!parsed.endDraftReached) {
    throw new Error('AI 输出未正确结束，缺少 END_DRAFT 标记');
  }

  if (parsed.warnings.length > 0 && parsed.components.length === 0) {
    throw new Error('AI 输出中的组件都解析失败，当前没有可应用内容，请重试');
  }

  const rawDraft: QuestionnaireDraft = normalizeDraft(
    parsed,
    dto.questionnaire,
    dto.intent,
    dto.instruction,
    dto.focusedComponentId,
  );

  if (dto.intent === 'edit') {
    const focusedBinding = getFocusedQuestionBinding(
      dto.focusedComponentId,
      dto.questionnaire.components || [],
    );
    const referencedBindings = getReferencedQuestionBindings(
      dto.instruction,
      dto.questionnaire.components || [],
    );
    const snapshotIds = new Set(
      (dto.questionnaire.components || []).map((component) => component.fe_id),
    );
    const snapshotComponentMap = new Map(
      (dto.questionnaire.components || []).map((component) => [
        component.fe_id,
        component,
      ]),
    );
    const draftIds = new Set(
      rawDraft.components.map((component) => component.fe_id),
    );

    if (focusedBinding) {
      if (!draftIds.has(focusedBinding.fe_id)) {
        throw new Error('AI 未正确修改当前选中的题目，请重试');
      }

      const changedExistingComponents = rawDraft.components.filter(
        (component) => {
          const snapshotComponent = snapshotComponentMap.get(component.fe_id);
          return snapshotComponent
            ? isQuestionComponentChanged(snapshotComponent, component)
            : false;
        },
      );
      const touchedOtherExistingComponents = changedExistingComponents.filter(
        (component) => component.fe_id !== focusedBinding.fe_id,
      );
      if (touchedOtherExistingComponents.length > 0) {
        throw new Error('当前仅支持修改选中的题目，请不要同时修改其他题目');
      }

      const hasUnexpectedAdditions = rawDraft.components.some(
        (component) => !snapshotIds.has(component.fe_id),
      );
      if (hasUnexpectedAdditions) {
        throw new Error('当前仅支持修改选中的题目，不能同时新增题目，请重试');
      }

      const pageConfigChanged =
        rawDraft.title !== dto.questionnaire.title ||
        rawDraft.description !== dto.questionnaire.description ||
        rawDraft.footerText !== dto.questionnaire.footerText;
      if (pageConfigChanged) {
        throw new Error('当前仅支持修改选中的题目，不能同时修改问卷标题或描述');
      }
    }

    const missingReferencedBindings = referencedBindings.filter(
      (binding) => !draftIds.has(binding.fe_id),
    );

    if (missingReferencedBindings.length > 0) {
      throw new Error('AI 未正确引用你指定的题目，请重试');
    }

    if (!instructionAllowsAdditions(dto.instruction)) {
      const hasUnexpectedAdditions = rawDraft.components.some(
        (component) => !snapshotIds.has(component.fe_id),
      );

      if (hasUnexpectedAdditions) {
        throw new Error('本轮修改未请求新增题目，但 AI 返回了新增内容，请重试');
      }
    }
  }

  const { draft: validatedDraft, warnings: validationWarnings } = validateDraft(
    rawDraft,
    dto.questionnaire,
    dto.intent,
  );

  if (validationWarnings.length > 0) {
    warningCount += validationWarnings.length;
    sink.emit('warning', {
      code: 'COMPONENT_VALIDATION_FILTERED',
      message: `${validationWarnings.length} 个组件未通过校验已自动跳过，其余组件仍可应用。`,
      details: validationWarnings,
    });
  }

  if (shouldStop()) return null;

  const reply =
    sanitizeAssistantReply(parsed.assistantReply) || '已生成可应用草稿';
  const summary = buildDiffSummary(
    dto.questionnaire,
    validatedDraft,
    dto.intent,
  );
  sink.emit('draft', {
    reply,
    draft: validatedDraft,
    summary,
  });
  sink.emit('done', {
    ok: true,
    stage: workflowStage,
  });
  return {
    reply,
    draft: validatedDraft,
    summary,
    warningCount: warningCount + parsed.warnings.length,
    providerUsage,
    completionText: accumulatedContent,
  };
};
