import { Response } from 'express';
import {
  CopilotWorkflowStage,
  DraftSummary,
  QuestionnaireDraft,
} from '@/service/ai/dto/copilot-stream.dto';
import { SanitizedCopilotDto } from '@/service/ai/ai-copilot-sanitize';
import { buildCopilotLatestBatchState } from '@/service/ai/ai-copilot-checkpoint';
import { CopilotStreamStopReason } from '@/service/ai/ai-copilot-runtime-lifecycle';
import {
  AiMessageKind,
  AiMessageRole,
} from '@/service/ai/ai-conversation-helpers';

type PersistConversationDeps = {
  saveConversation: (conversation: any) => Promise<any>;
  persistConversationMessage: (params: {
    conversationId: number;
    role: AiMessageRole;
    kind?: AiMessageKind;
    content: string;
    toolName?: string | null;
    meta?: Record<string, any> | null;
  }) => Promise<any>;
};

type CopilotEventSink = {
  emit: (event: string, data: Record<string, any>) => void;
};

export const finalizePromptPolishSuccess = async (
  deps: PersistConversationDeps,
  params: {
    conversation: any;
    workflowStage: CopilotWorkflowStage;
    requestId: string;
    reply: string;
    refinedPrompt: string;
  },
) => {
  const { conversation, workflowStage, requestId, reply, refinedPrompt } =
    params;

  conversation.last_instruction = refinedPrompt;
  conversation.last_runtime_status = 'awaiting_confirmation';
  conversation.last_workflow_stage = workflowStage;
  conversation.latest_activity_at = new Date();
  await deps.saveConversation(conversation);
  await deps.persistConversationMessage({
    conversationId: conversation.id,
    role: 'assistant',
    kind: 'chat',
    content: reply,
    meta: {
      requestId,
      stage: workflowStage,
      refinedPrompt,
    },
  });
};

export const finalizeDraftStreamSuccess = async (
  deps: PersistConversationDeps,
  params: {
    conversation: any;
    safeDto: SanitizedCopilotDto;
    workflowStage: CopilotWorkflowStage;
    requestId: string;
    draftResult: {
      reply: string;
      draft: QuestionnaireDraft;
      summary: DraftSummary;
    };
  },
) => {
  const { conversation, safeDto, workflowStage, requestId, draftResult } =
    params;

  conversation.last_instruction = safeDto.instruction;
  conversation.latest_draft = draftResult.draft;
  conversation.latest_summary = draftResult.summary;
  conversation.last_runtime_status = 'draft_ready';
  conversation.last_workflow_stage = workflowStage;
  conversation.latest_base_questionnaire = safeDto.questionnaire;
  conversation.latest_batches = buildCopilotLatestBatchState({
    requestId,
    safeDto,
    conversation,
    workflowStage,
    runtimeStatus: 'draft_ready',
    draft: draftResult.draft,
    summary: draftResult.summary,
  });
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
};

export const handleCopilotStopOrError = async (
  deps: PersistConversationDeps,
  params: {
    stopReason: CopilotStreamStopReason | null;
    conversation: any | null;
    workflowStage: CopilotWorkflowStage | undefined;
    lifecycle: {
      setBackgroundRunning: (nextValue: boolean) => void;
      clearDisconnectGraceTimeout: () => void;
    };
    persistDraftCheckpoint: (params?: {
      draft?: QuestionnaireDraft | null;
      summary?: DraftSummary | null;
      runtimeStatus?: string | null;
      force?: boolean;
    }) => Promise<void>;
    conversationId: number | null;
    error: any;
    timeoutTriggered: boolean;
    sseInitialized: boolean;
    sink: CopilotEventSink;
    res: Response;
  },
) => {
  const {
    stopReason,
    conversation,
    workflowStage,
    lifecycle,
    persistDraftCheckpoint,
    conversationId,
    error,
    timeoutTriggered,
    sseInitialized,
    sink,
    res,
  } = params;

  if (stopReason === 'cancel' || stopReason === 'disconnect') {
    if (conversation && workflowStage) {
      conversation.last_runtime_status = 'cancelled';
      conversation.last_workflow_stage = workflowStage;
      conversation.latest_activity_at = new Date();
      await deps.saveConversation(conversation);
    }
    return true;
  }

  if (stopReason === 'disconnect_timeout') {
    if (conversation && workflowStage) {
      lifecycle.setBackgroundRunning(false);
      lifecycle.clearDisconnectGraceTimeout();
      await persistDraftCheckpoint({
        runtimeStatus: 'resume_available',
        force: true,
      });
    }
    return true;
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

  const errorPayload = {
    code: timeoutTriggered ? 'COPILOT_STREAM_TIMEOUT' : 'COPILOT_STREAM_FAILED',
    message: timeoutTriggered
      ? 'AI 流式处理超时，请稍后重试'
      : error?.message || 'AI 工作台生成失败，请稍后重试',
    stage: workflowStage,
    retryable: true,
  };

  if (sseInitialized) {
    sink.emit('error', errorPayload);
  } else if (!res.headersSent) {
    res.status(500).json({
      code: errorPayload.code,
      message: errorPayload.message,
    });
  }

  return true;
};
