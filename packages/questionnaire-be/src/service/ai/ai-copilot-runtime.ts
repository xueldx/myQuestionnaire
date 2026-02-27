import OpenAI from 'openai';
import { Request, Response } from 'express';
import { CopilotWorkflowStage } from '@/service/ai/dto/copilot-stream.dto';
import {
  initSseResponse,
  writeSseEvent,
} from '@/service/ai/utils/write-sse-event';
import { UserToken } from '@/common/decorators/current-user.decorator';
import { SanitizedCopilotDto } from '@/service/ai/ai-copilot-sanitize';
import { createCopilotCheckpointManager } from '@/service/ai/ai-copilot-checkpoint';
import {
  initializeCopilotConversationState,
  ModelRuntimeConfig,
  prepareCopilotRequestContext,
} from '@/service/ai/ai-copilot-request-context';
import {
  finalizeDraftStreamSuccess,
  finalizePromptPolishSuccess,
  handleCopilotStopOrError,
} from '@/service/ai/ai-copilot-finalize';
import { createCopilotRuntimeLifecycle } from '@/service/ai/ai-copilot-runtime-lifecycle';
import {
  buildToolContextBlock,
  collectToolContext,
  CopilotEventSink,
  CopilotToolRuntimeDeps,
} from '@/service/ai/ai-copilot-tools';
import {
  streamDraftStage,
  streamPromptRefine,
} from '@/service/ai/ai-copilot-stream-stages';

type ExecuteCopilotStreamDeps = CopilotToolRuntimeDeps & {
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
  let sseInitialized = false;
  let timeoutTriggered = false;
  let timeoutId: NodeJS.Timeout | null = null;
  let conversationId: number | null = null;
  let requestId: string | null = null;
  let conversation: any | null = null;
  let workflowStage: CopilotWorkflowStage | undefined;
  let safeDto: SanitizedCopilotDto | null = null;
  const lifecycle = createCopilotRuntimeLifecycle({
    req,
    res,
    abortController,
    shouldContinueAfterDisconnect: () =>
      workflowStage === 'generate' || workflowStage === 'edit',
    hasConversation: () => Boolean(conversation),
    onEnterBackgroundRunning: async () => {
      await persistDraftCheckpoint({
        runtimeStatus: 'background_running',
        force: true,
      });
    },
  });
  const { runtimeState } = lifecycle;
  const sink: CopilotEventSink = {
    emit: (event, data) => {
      if (!runtimeState.clientConnected) return;
      if (res.writableEnded || res.destroyed) {
        runtimeState.clientConnected = false;
        return;
      }

      try {
        writeSseEvent(res, event, data);
      } catch (error) {
        runtimeState.clientConnected = false;
      }
    },
    isClientConnected: () => runtimeState.clientConnected,
  };
  const { persistDraftCheckpoint } = createCopilotCheckpointManager({
    saveConversation: deps.saveConversation,
    runtimeState,
    getContext: () => ({
      conversation,
      safeDto,
      workflowStage,
      requestId,
    }),
  });

  try {
    initSseResponse(res);
    sseInitialized = true;

    const preparedContext = await prepareCopilotRequestContext(deps, dto, user);
    safeDto = preparedContext.safeDto;
    workflowStage = preparedContext.workflowStage;
    lifecycle.attach();

    const { resolvedModel, client } = preparedContext;
    requestId = preparedContext.requestId;
    conversation = preparedContext.conversation;
    conversationId = conversation.id;
    lifecycle.resumeBackgroundIfDetached();
    deps.registerActiveRequest({
      requestId,
      conversationId: conversation.id,
      userId: user.userId,
      abort: () => lifecycle.stopStream('cancel'),
    });
    await initializeCopilotConversationState(deps, {
      conversation,
      safeDto,
      workflowStage,
      requestId,
      resolvedModelKey: resolvedModel.key,
      defaultConversationTitle,
      backgroundRunning: runtimeState.backgroundRunning,
    });

    timeoutId = setTimeout(() => {
      timeoutTriggered = true;
      lifecycle.stopStream('timeout');
    }, timeoutMs);

    sink.emit('meta', {
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
      sink,
      shouldStop: () => abortController.signal.aborted,
    });
    const toolContextText = buildToolContextBlock(deps, toolContextList);

    if (safeDto.intent === 'generate' && safeDto.generateStage === 'polish') {
      const polishResult = await streamPromptRefine(
        safeDto,
        client,
        resolvedModel.config,
        abortController,
        sink,
        toolContextText,
        () => abortController.signal.aborted,
        () => abortController.signal.aborted,
      );
      if (polishResult) {
        lifecycle.clearDisconnectGraceTimeout();
        await finalizePromptPolishSuccess(deps, {
          conversation,
          workflowStage,
          requestId,
          reply: polishResult.reply,
          refinedPrompt: polishResult.refinedPrompt,
        });
      }
    } else {
      const draftResult = await streamDraftStage(
        safeDto,
        client,
        resolvedModel.config,
        abortController,
        sink,
        toolContextText,
        () => abortController.signal.aborted,
        {
          onPhaseChange: async (phase) => {
            await persistDraftCheckpoint({
              runtimeStatus: phase,
            });
          },
          onCheckpoint: async ({ draft, runtimeStatus }) => {
            await persistDraftCheckpoint({
              draft,
              summary: null,
              runtimeStatus,
            });
          },
        },
      );
      if (draftResult) {
        lifecycle.clearDisconnectGraceTimeout();
        lifecycle.setBackgroundRunning(false);
        await finalizeDraftStreamSuccess(deps, {
          conversation,
          safeDto,
          workflowStage,
          requestId,
          draftResult,
        });
      }
    }
  } catch (error: any) {
    await handleCopilotStopOrError(deps, {
      stopReason: lifecycle.getStopReason(),
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
    });
    return;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    lifecycle.detach();
    if (requestId) {
      deps.unregisterActiveRequest(requestId);
    }
    if (!res.writableEnded && !res.destroyed) {
      res.end();
    }
  }
};
