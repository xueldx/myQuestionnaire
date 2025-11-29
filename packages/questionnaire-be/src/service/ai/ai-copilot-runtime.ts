import OpenAI from 'openai';
import { Request, Response } from 'express';
import {
  CopilotRuntimePhase,
  CopilotToolName,
  CopilotWorkflowStage,
  DraftSummary,
  QuestionnaireDraft,
} from '@/service/ai/dto/copilot-stream.dto';
import {
  initSseResponse,
  writeSseEvent,
} from '@/service/ai/utils/write-sse-event';
import { UserToken } from '@/common/decorators/current-user.decorator';
import { parseCopilotBlocks } from '@/service/ai/utils/parse-copilot-blocks';
import { normalizeDraft } from '@/service/ai/utils/draft-normalizer';
import { validateDraft } from '@/service/ai/utils/draft-validator';
import { buildDiffSummary } from '@/service/ai/utils/build-diff-summary';
import { buildPromptPolishPrompt } from '@/service/ai/ai-prompt/build-prompt-polish-prompt';
import { buildCopilotPrompt } from '@/service/ai/ai-prompt/build-copilot-prompt';
import { SanitizedCopilotDto } from '@/service/ai/ai-copilot-sanitize';
import {
  AiMessageKind,
  AiMessageRole,
} from '@/service/ai/ai-conversation-helpers';

type CopilotToolContextItem = {
  name: CopilotToolName;
  callId: string;
  summary: string;
  payload: unknown;
};

type ModelRuntimeConfig = {
  model: string;
  apiKey: string;
  baseURL: string;
};

type RuntimeDeps = {
  createToolCallId: (toolName: CopilotToolName) => string;
  buildComponentCatalogPayload: () => Array<Record<string, any>>;
  sanitizeToolPreview: (payload: unknown) => string;
  getEnhancedStats: (id: number) => Promise<any>;
  persistConversationMessage: (params: {
    conversationId: number;
    role: AiMessageRole;
    kind?: AiMessageKind;
    content: string;
    toolName?: string | null;
    meta?: Record<string, any> | null;
  }) => Promise<any>;
};

type ExecuteCopilotStreamDeps = RuntimeDeps & {
  openai: OpenAI;
  defaultModel: string;
  sanitizeCopilotDto: (dto: any) => SanitizedCopilotDto;
  ensureQuestionnaireAccess: (
    questionnaireId: number,
    userId: number,
  ) => Promise<any>;
  resolveModelSelection: (modelName?: string) => {
    key: string;
    config: ModelRuntimeConfig;
  };
  createClientForModel: (modelName: string) => OpenAI;
  createRequestId: () => string;
  resolveCopilotConversation: (
    dto: SanitizedCopilotDto,
    userId: number,
  ) => Promise<any>;
  loadConversationHistory: (
    conversationId: number,
  ) => Promise<Array<Pick<any, 'role' | 'content'>>>;
  sanitizeConversationHistory: (
    messages: Array<Pick<any, 'role' | 'content'>>,
  ) => Array<{ role: 'user' | 'assistant'; content: string }>;
  pickConversationTitle: (title?: string, fallbackText?: string) => string;
  registerActiveRequest: (request: {
    requestId: string;
    conversationId: number;
    userId: number;
    abort: () => void;
  }) => void;
  unregisterActiveRequest: (requestId: string) => void;
  saveConversation: (conversation: any) => Promise<any>;
};

export const shouldCollectAnswerStats = (dto: SanitizedCopilotDto) => {
  const normalizedInstruction = [dto.originalInstruction, dto.instruction]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();

  return [
    '分析',
    '统计',
    '数据',
    '结果',
    '满意度',
    '作答',
    '答卷',
    '完成率',
    '转化',
    '表现',
    '回收',
  ].some((keyword) => normalizedInstruction.includes(keyword.toLowerCase()));
};

export const buildToolContextBlock = (
  deps: RuntimeDeps,
  toolContextList: CopilotToolContextItem[],
) => {
  if (toolContextList.length === 0) return '无额外工具上下文';

  return toolContextList
    .map((item) => {
      const preview = deps.sanitizeToolPreview(item.payload);
      return [
        `工具名称: ${item.name}`,
        `摘要: ${item.summary}`,
        '输出预览:',
        preview || '无',
      ].join('\n');
    })
    .join('\n\n');
};

export const emitToolCall = async (
  deps: RuntimeDeps,
  res: Response,
  conversationId: number,
  toolName: CopilotToolName,
  callId: string,
  summary: string,
) => {
  writeSseEvent(res, 'tool_call', {
    callId,
    toolName,
    summary,
  });
  await deps.persistConversationMessage({
    conversationId,
    role: 'tool',
    kind: 'tool_call',
    content: summary,
    toolName,
    meta: {
      callId,
      status: 'running',
    },
  });
};

export const emitToolResult = async (
  deps: RuntimeDeps,
  res: Response,
  conversationId: number,
  toolName: CopilotToolName,
  callId: string,
  summary: string,
  payload: unknown,
  status: 'success' | 'error' = 'success',
) => {
  const preview = deps.sanitizeToolPreview(payload);
  writeSseEvent(res, 'tool_result', {
    callId,
    toolName,
    status,
    summary,
    preview,
  });
  await deps.persistConversationMessage({
    conversationId,
    role: 'tool',
    kind: 'tool_result',
    content: summary,
    toolName,
    meta: {
      callId,
      status,
      preview,
    },
  });
};

export const collectToolContext = async (
  deps: RuntimeDeps,
  params: {
    dto: SanitizedCopilotDto;
    conversationId: number;
    res: Response;
    isClosed: () => boolean;
  },
) => {
  const { dto, conversationId, res, isClosed } = params;
  const toolContextList: CopilotToolContextItem[] = [];

  const runTool = async (
    toolName: CopilotToolName,
    summary: string,
    runner: () => Promise<unknown> | unknown,
  ) => {
    if (isClosed()) return;
    const callId = deps.createToolCallId(toolName);
    await emitToolCall(deps, res, conversationId, toolName, callId, summary);

    try {
      const payload = await runner();
      if (isClosed()) return;
      toolContextList.push({
        name: toolName,
        callId,
        summary,
        payload,
      });
      await emitToolResult(
        deps,
        res,
        conversationId,
        toolName,
        callId,
        summary,
        payload,
      );
    } catch (error: any) {
      if (isClosed()) return;
      await emitToolResult(
        deps,
        res,
        conversationId,
        toolName,
        callId,
        error?.message || `${toolName} 执行失败`,
        {
          message: error?.message || `${toolName} 执行失败`,
        },
        'error',
      );
    }
  };

  await runTool(
    'get_questionnaire_snapshot',
    '读取当前编辑器中的问卷快照',
    async () => ({
      questionnaireId: dto.questionnaireId,
      title: dto.questionnaire.title,
      description: dto.questionnaire.description,
      footerText: dto.questionnaire.footerText,
      componentCount: dto.questionnaire.components.length,
      components: dto.questionnaire.components,
    }),
  );

  await runTool(
    'get_component_catalog',
    '读取问卷组件目录与约束',
    async () => ({
      count: deps.buildComponentCatalogPayload().length,
      components: deps.buildComponentCatalogPayload(),
    }),
  );

  if (shouldCollectAnswerStats(dto)) {
    await runTool(
      'get_answer_statistics',
      '读取当前问卷的作答统计摘要',
      async () => (await deps.getEnhancedStats(dto.questionnaireId)) || null,
    );
  }

  return toolContextList;
};

export const getWorkflowStage = (
  dto: SanitizedCopilotDto,
): CopilotWorkflowStage => {
  if (dto.intent === 'edit') return 'edit';
  return dto.generateStage;
};

export const emitCopilotPhase = (
  res: Response,
  currentPhaseRef: { current: CopilotRuntimePhase | null },
  phase: CopilotRuntimePhase,
  stage: CopilotWorkflowStage,
) => {
  if (currentPhaseRef.current === phase) return;
  currentPhaseRef.current = phase;
  writeSseEvent(res, 'phase', {
    phase,
    stage,
  });
};

const emitAssistantReplyChunks = async (
  res: Response,
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
    writeSseEvent(res, 'assistant_delta', { delta });

    if (start + chunkSize < normalizedReply.length && delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
};

export const streamPromptRefine = async (
  dto: SanitizedCopilotDto,
  client: OpenAI,
  modelConfig: ModelRuntimeConfig,
  abortController: AbortController,
  res: Response,
  toolContextText: string,
  isClosed: () => boolean,
  shouldStop?: () => boolean,
): Promise<{ refinedPrompt: string; reply: string } | null> => {
  const prompt = buildPromptPolishPrompt(dto, toolContextText);
  let refinedPrompt = '';
  const currentPhaseRef: { current: CopilotRuntimePhase | null } = {
    current: null,
  };

  emitCopilotPhase(res, currentPhaseRef, 'polishing', 'polish');

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
    },
    {
      signal: abortController.signal,
    },
  );

  for await (const chunk of stream) {
    if (isClosed()) break;

    const content = chunk.choices[0]?.delta?.content || '';
    if (!content) continue;

    refinedPrompt += content;
    writeSseEvent(res, 'prompt_delta', { delta: content });
  }

  if (isClosed()) return null;

  const finalPrompt = refinedPrompt.trim();
  if (!finalPrompt) {
    throw new Error('AI 未生成可确认的润色 Prompt，请重试');
  }

  const reply = 'Prompt 润色完成，已回填到输入框，可继续编辑或直接发送。';
  emitCopilotPhase(res, currentPhaseRef, 'answering', 'polish');
  await emitAssistantReplyChunks(res, reply, {
    shouldStop,
  });
  if (isClosed()) return null;
  writeSseEvent(res, 'prompt_refined', {
    prompt: finalPrompt,
    reply,
  });
  writeSseEvent(res, 'done', {
    ok: true,
    stage: 'polish',
  });
  return {
    refinedPrompt: finalPrompt,
    reply,
  };
};

export const streamDraftStage = async (
  dto: SanitizedCopilotDto,
  client: OpenAI,
  modelConfig: ModelRuntimeConfig,
  abortController: AbortController,
  res: Response,
  toolContextText: string,
  isClosed: () => boolean,
): Promise<{
  reply: string;
  draft: QuestionnaireDraft;
  summary: DraftSummary;
} | null> => {
  const prompt = buildCopilotPrompt(dto, toolContextText);
  const workflowStage = getWorkflowStage(dto);
  let accumulatedContent = '';
  let lastAssistantReply = '';
  let lastDraftSignature = '';
  let lastWarningSignature = '';
  const currentPhaseRef: { current: CopilotRuntimePhase | null } = {
    current: null,
  };

  emitCopilotPhase(res, currentPhaseRef, 'thinking', workflowStage);

  const emitParserWarning = (parsedWarningList: string[]) => {
    if (parsedWarningList.length === 0) return;

    const nextSignature = parsedWarningList.join('|');
    if (nextSignature === lastWarningSignature) return;

    lastWarningSignature = nextSignature;
    writeSseEvent(res, 'warning', {
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
    },
    {
      signal: abortController.signal,
    },
  );

  for await (const chunk of stream) {
    if (isClosed()) break;

    const content = chunk.choices[0]?.delta?.content || '';
    if (!content) continue;

    accumulatedContent += content;
    const parsed = parseCopilotBlocks(accumulatedContent);
    emitParserWarning(parsed.warnings);

    if (parsed.assistantReply.length > lastAssistantReply.length) {
      const delta = parsed.assistantReply.slice(lastAssistantReply.length);
      lastAssistantReply = parsed.assistantReply;

      if (delta) {
        emitCopilotPhase(res, currentPhaseRef, 'answering', workflowStage);
        writeSseEvent(res, 'assistant_delta', { delta });
      }
    }

    if (parsed.pageConfig || parsed.components.length > 0) {
      const draftPartial = normalizeDraft(
        parsed,
        dto.questionnaire,
        dto.intent,
      );
      const signature = JSON.stringify(draftPartial);

      if (signature !== lastDraftSignature) {
        lastDraftSignature = signature;
        emitCopilotPhase(res, currentPhaseRef, 'drafting', workflowStage);
        writeSseEvent(res, 'draft_partial', {
          draft: draftPartial,
          progress: {
            componentsParsed: draftPartial.components.length,
          },
        });
      }
    }
  }

  if (isClosed()) return null;

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
  );

  const { draft: validatedDraft, warnings: validationWarnings } = validateDraft(
    rawDraft,
    dto.questionnaire,
    dto.intent,
  );

  if (validationWarnings.length > 0) {
    writeSseEvent(res, 'warning', {
      code: 'COMPONENT_VALIDATION_FILTERED',
      message: `${validationWarnings.length} 个组件未通过校验已自动跳过，其余组件仍可应用。`,
      details: validationWarnings,
    });
  }

  if (isClosed()) return null;

  const reply = parsed.assistantReply || '已生成可应用草稿';
  const summary = buildDiffSummary(
    dto.questionnaire,
    validatedDraft,
    dto.intent,
  );
  writeSseEvent(res, 'draft', {
    reply,
    draft: validatedDraft,
    summary,
  });
  writeSseEvent(res, 'done', {
    ok: true,
    stage: workflowStage,
  });
  return {
    reply,
    draft: validatedDraft,
    summary,
  };
};

export const executeCopilotStream = async (
  deps: ExecuteCopilotStreamDeps,
  dto: any,
  user: UserToken,
  req: Request,
  res: Response,
  timeoutMs: number,
  defaultConversationTitle: string,
) => {
  const abortController = new AbortController();
  let stopReason: 'disconnect' | 'cancel' | 'timeout' | null = null;
  let sseInitialized = false;
  let timeoutTriggered = false;
  let timeoutId: NodeJS.Timeout | null = null;
  let conversationId: number | null = null;
  let requestId: string | null = null;
  let conversation: any | null = null;

  const stopStream = (reason: 'disconnect' | 'cancel' | 'timeout') => {
    if (stopReason) return;
    stopReason = reason;
    abortController.abort();
  };

  const handleRequestAborted = () => {
    stopStream('disconnect');
  };

  const handleResponseClosed = () => {
    if (res.writableEnded) return;
    stopStream('disconnect');
  };

  req.on('aborted', handleRequestAborted);
  res.on('close', handleResponseClosed);

  try {
    initSseResponse(res);
    sseInitialized = true;

    const safeDto = deps.sanitizeCopilotDto(dto);
    await deps.ensureQuestionnaireAccess(safeDto.questionnaireId, user.userId);

    if (!safeDto.instruction) {
      throw new Error('请输入本轮 AI 指令后再发送');
    }
    if (
      safeDto.intent === 'generate' &&
      safeDto.generateStage === 'generate' &&
      !safeDto.originalInstruction
    ) {
      safeDto.originalInstruction = safeDto.instruction;
    }

    const resolvedModel = deps.resolveModelSelection(safeDto.model);
    const client =
      resolvedModel.key === deps.defaultModel
        ? deps.openai
        : deps.createClientForModel(resolvedModel.key);
    requestId = deps.createRequestId();
    const workflowStage = getWorkflowStage(safeDto);
    conversation = await deps.resolveCopilotConversation(
      safeDto,
      user.userId,
    );
    conversationId = conversation.id;
    deps.registerActiveRequest({
      requestId,
      conversationId: conversation.id,
      userId: user.userId,
      abort: () => stopStream('cancel'),
    });

    const conversationHistory = await deps.loadConversationHistory(
      conversation.id,
    );
    safeDto.history =
      conversationHistory.length > 0
        ? deps.sanitizeConversationHistory(conversationHistory)
        : safeDto.history;
    conversation.intent = safeDto.intent;
    conversation.last_model = resolvedModel.key;
    conversation.last_instruction = safeDto.instruction;
    conversation.last_runtime_status =
      workflowStage === 'polish' ? 'polishing' : 'connecting';
    conversation.last_workflow_stage = workflowStage;
    conversation.latest_activity_at = new Date();
    if (conversation.title === defaultConversationTitle) {
      conversation.title = deps.pickConversationTitle(
        undefined,
        safeDto.originalInstruction || safeDto.instruction,
      );
    }
    await deps.saveConversation(conversation);

    await deps.persistConversationMessage({
      conversationId: conversation.id,
      role: 'user',
      kind: 'chat',
      content:
        safeDto.intent === 'generate' && safeDto.generateStage === 'polish'
          ? `润色：${safeDto.instruction}`
          : safeDto.instruction,
      meta: {
        requestId,
        stage: workflowStage,
      },
    });

    timeoutId = setTimeout(() => {
      timeoutTriggered = true;
      stopStream('timeout');
    }, timeoutMs);

    writeSseEvent(res, 'meta', {
      requestId,
      conversationId: conversation.id,
      intent: safeDto.intent,
      baseVersion: safeDto.baseVersion,
      stage: workflowStage,
      timeoutMs,
    });

    const toolContextList = await collectToolContext(deps, {
      dto: safeDto,
      conversationId: conversation.id,
      res,
      isClosed: () => stopReason !== null,
    });
    const toolContextText = buildToolContextBlock(deps, toolContextList);

    if (safeDto.intent === 'generate' && safeDto.generateStage === 'polish') {
      const polishResult = await streamPromptRefine(
        safeDto,
        client,
        resolvedModel.config,
        abortController,
        res,
        toolContextText,
        () => stopReason !== null,
        () => stopReason !== null,
      );
      if (polishResult) {
        conversation.last_instruction = polishResult.refinedPrompt;
        conversation.last_runtime_status = 'awaiting_confirmation';
        conversation.last_workflow_stage = workflowStage;
        conversation.latest_activity_at = new Date();
        await deps.saveConversation(conversation);
        await deps.persistConversationMessage({
          conversationId: conversation.id,
          role: 'assistant',
          kind: 'chat',
          content: polishResult.reply,
          meta: {
            requestId,
            stage: workflowStage,
            refinedPrompt: polishResult.refinedPrompt,
          },
        });
      }
    } else {
      const draftResult = await streamDraftStage(
        safeDto,
        client,
        resolvedModel.config,
        abortController,
        res,
        toolContextText,
        () => stopReason !== null,
      );
      if (draftResult) {
        conversation.last_instruction = safeDto.instruction;
        conversation.latest_draft = draftResult.draft;
        conversation.latest_summary = draftResult.summary;
        conversation.last_runtime_status = 'draft_ready';
        conversation.last_workflow_stage = workflowStage;
        conversation.latest_activity_at = new Date();
        await deps.saveConversation(conversation);
        await deps.persistConversationMessage({
          conversationId: conversation.id,
          role: 'assistant',
          kind: 'chat',
          content: draftResult.reply,
          meta: {
            requestId,
            stage: workflowStage,
            draft: draftResult.draft,
            summary: draftResult.summary,
          },
        });
      }
    }
  } catch (error: any) {
    const workflowStage =
      !sseInitialized || !dto
        ? undefined
        : getWorkflowStage(deps.sanitizeCopilotDto(dto));

    if (stopReason === 'cancel' || stopReason === 'disconnect') {
      if (conversation && workflowStage) {
        conversation.last_runtime_status = 'cancelled';
        conversation.last_workflow_stage = workflowStage;
        conversation.latest_activity_at = new Date();
        await deps.saveConversation(conversation);
      }
      return;
    }

    console.error('AI copilot stream error:', error);
    if (conversationId) {
      if (conversation) {
        conversation.last_runtime_status = 'error';
        conversation.last_workflow_stage =
          workflowStage || conversation.last_workflow_stage;
        conversation.latest_activity_at = new Date();
        await deps.saveConversation(conversation);
      }
      await deps.persistConversationMessage({
        conversationId,
        role: 'assistant',
        kind: 'chat',
        content: error?.message || 'AI 工作台生成失败，请稍后重试',
        meta: {
          status: 'error',
        },
      });
    }
    if (sseInitialized) {
      writeSseEvent(res, 'error', {
        code: timeoutTriggered
          ? 'COPILOT_STREAM_TIMEOUT'
          : 'COPILOT_STREAM_FAILED',
        message: timeoutTriggered
          ? 'AI 流式处理超时，请稍后重试'
          : error?.message || 'AI 工作台生成失败，请稍后重试',
        stage: workflowStage,
        retryable: true,
      });
    } else if (!res.headersSent) {
      res.status(500).json({
        code: timeoutTriggered
          ? 'COPILOT_STREAM_TIMEOUT'
          : 'COPILOT_STREAM_FAILED',
        message: timeoutTriggered
          ? 'AI 流式处理超时，请稍后重试'
          : error?.message || 'AI 工作台生成失败，请稍后重试',
      });
    }
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    req.off('aborted', handleRequestAborted);
    res.off('close', handleResponseClosed);
    if (requestId) {
      deps.unregisterActiveRequest(requestId);
    }
    if (!res.writableEnded) {
      res.end();
    }
  }
};
