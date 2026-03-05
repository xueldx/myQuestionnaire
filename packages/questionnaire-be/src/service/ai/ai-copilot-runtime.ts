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
  CopilotToolContextItem,
  CopilotToolRuntimeDeps,
} from '@/service/ai/ai-copilot-tools';
import {
  streamDraftStage,
  streamPromptRefine,
} from '@/service/ai/ai-copilot-stream-stages';
import { buildPromptPolishPrompt } from '@/service/ai/ai-prompt/build-prompt-polish-prompt';
import { buildCopilotPrompt } from '@/service/ai/ai-prompt/build-copilot-prompt';
import { AiObservabilitySink } from '@/service/ai/observability/ai-observability.sink';
import {
  buildConversationPromptContext,
  persistConversationContextAfterSuccess,
} from '@/service/ai/context/conversation-context-manager';
import { CopilotContextStrategy } from '@/service/ai/context/context-strategy';
import { buildWindowedPromptPolishPrompt } from '@/service/ai/ai-prompt/build-windowed-prompt-polish-prompt';
import { buildWindowedCopilotPrompt } from '@/service/ai/ai-prompt/build-windowed-copilot-prompt';

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
  loadConversationContext: (conversationId: number) => Promise<any | null>;
  updateConversationContext: (
    conversationId: number,
    payload: Record<string, any>,
  ) => Promise<void>;
  resolveContextStrategy: () => CopilotContextStrategy;
  observabilitySink: AiObservabilitySink;
};

const buildContextSnapshot = (
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  dto: SanitizedCopilotDto,
  promptText: string,
  toolContextText: string,
  toolContextList: CopilotToolContextItem[],
) => ({
  historyMessageCount: history.length,
  questionnaireComponentCount: dto.questionnaire.components.length,
  historyChars: history.reduce(
    (total, item) => total + String(item.content || '').length,
    0,
  ),
  questionnaireChars: JSON.stringify(dto.questionnaire).length,
  toolContextChars: toolContextText.length,
  promptChars: promptText.length,
  hasFocusedComponent: Boolean(dto.focusedComponentId),
  hasAnswerStatsTool: toolContextList.some(
    (item) => item.name === 'get_answer_statistics',
  ),
});

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
  let requestStartedAt: Date | null = null;
  let promptText = '';
  let completionText = '';
  let warningCount = 0;
  let draftReady = false;
  let draftComponentCount = 0;
  let firstTokenMarked = false;
  let contextStrategy: CopilotContextStrategy | null = null;
  let promptContext: ReturnType<typeof buildConversationPromptContext> | null =
    null;
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
      const shouldMarkFirstToken =
        requestId &&
        !firstTokenMarked &&
        ['prompt_delta', 'assistant_delta', 'draft_partial'].includes(event);
      if (shouldMarkFirstToken) {
        firstTokenMarked = true;
        void deps.observabilitySink.markFirstToken({
          requestId,
          firstTokenAt: new Date(),
        });
      }
      if (event === 'warning') {
        warningCount += Array.isArray(data?.details) ? data.details.length : 1;
      }
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
    const activeWorkflowStage =
      workflowStage ||
      (safeDto.intent === 'edit'
        ? 'edit'
        : safeDto.generateStage === 'polish'
          ? 'polish'
          : 'generate');
    lifecycle.attach();

    const { resolvedModel, client } = preparedContext;
    requestId = preparedContext.requestId;
    conversation = preparedContext.conversation;
    conversationId = conversation.id;
    requestStartedAt = new Date();
    contextStrategy = deps.resolveContextStrategy();
    promptContext = buildConversationPromptContext({
      contextStrategy,
      dto: safeDto,
      conversation,
    });
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
      contextStrategy,
    });
    const toolContextText = buildToolContextBlock(deps, toolContextList);

    const persistConversationContext = () => {
      if (!contextStrategy || !conversation || !safeDto) return;
      void persistConversationContextAfterSuccess({
        contextStrategy,
        conversation,
        dto: safeDto,
        client,
        model: resolvedModel.config.model,
        loadConversationHistory: deps.loadConversationHistory,
        sanitizeConversationHistory: deps.sanitizeConversationHistory,
        loadConversationContext: deps.loadConversationContext,
        updateConversationContext: deps.updateConversationContext,
        onError: (error) => {
          console.error('copilot context persistence failed:', error);
        },
      });
    };

    if (safeDto.intent === 'generate' && safeDto.generateStage === 'polish') {
      promptText =
        contextStrategy === 'window_summary_outline_v1' && promptContext
          ? buildWindowedPromptPolishPrompt({
              dto: safeDto,
              toolContextText,
              context: promptContext,
            })
          : buildPromptPolishPrompt(safeDto, toolContextText);
      await deps.observabilitySink.startRequest({
        requestId,
        conversationId: conversation.id,
        questionnaireId: safeDto.questionnaireId,
        userId: user.userId,
        intent: safeDto.intent,
        workflowStage: activeWorkflowStage,
        modelKey: resolvedModel.key,
        providerBaseUrl: resolvedModel.config.baseURL,
        contextStrategy: contextStrategy || 'baseline_v1',
        startedAt: requestStartedAt || new Date(),
        contextSnapshot: buildContextSnapshot(
          promptContext?.recentMessages || safeDto.history.slice(-12),
          safeDto,
          promptText,
          toolContextText,
          toolContextList,
        ),
      });
      const polishResult = await streamPromptRefine(
        promptText,
        client,
        resolvedModel.config,
        abortController,
        sink,
        () => abortController.signal.aborted,
        () => abortController.signal.aborted,
      );
      if (polishResult) {
        completionText = polishResult.refinedPrompt;
        lifecycle.clearDisconnectGraceTimeout();
        await finalizePromptPolishSuccess(deps, {
          conversation,
          workflowStage,
          requestId,
          reply: polishResult.reply,
          refinedPrompt: polishResult.refinedPrompt,
        });
        await deps.observabilitySink.finishRequest({
          requestId,
          status: 'done',
          stopReason: null,
          finishedAt: new Date(),
          promptText,
          completionText,
          providerUsage: polishResult.providerUsage,
          usageSnapshot: {
            stage: workflowStage,
          },
          parseWarningCount: 0,
          draftReady: false,
          draftComponentCount: 0,
        });
        persistConversationContext();
      }
    } else {
      promptText =
        contextStrategy === 'window_summary_outline_v1' && promptContext
          ? buildWindowedCopilotPrompt({
              dto: safeDto,
              toolContextText,
              context: promptContext,
            })
          : buildCopilotPrompt(
              {
                ...safeDto,
                history:
                  promptContext?.recentMessages || safeDto.history.slice(-12),
              },
              toolContextText,
            );
      await deps.observabilitySink.startRequest({
        requestId,
        conversationId: conversation.id,
        questionnaireId: safeDto.questionnaireId,
        userId: user.userId,
        intent: safeDto.intent,
        workflowStage: activeWorkflowStage,
        modelKey: resolvedModel.key,
        providerBaseUrl: resolvedModel.config.baseURL,
        contextStrategy: contextStrategy || 'baseline_v1',
        startedAt: requestStartedAt || new Date(),
        contextSnapshot: buildContextSnapshot(
          promptContext?.recentMessages || safeDto.history.slice(-12),
          safeDto,
          promptText,
          toolContextText,
          toolContextList,
        ),
      });
      const draftResult = await streamDraftStage(
        promptText,
        safeDto,
        client,
        resolvedModel.config,
        abortController,
        sink,
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
        completionText = draftResult.completionText;
        warningCount = draftResult.warningCount;
        draftReady = true;
        draftComponentCount = draftResult.draft.components.length;
        lifecycle.clearDisconnectGraceTimeout();
        lifecycle.setBackgroundRunning(false);
        await finalizeDraftStreamSuccess(deps, {
          conversation,
          safeDto,
          workflowStage,
          requestId,
          draftResult,
        });
        await deps.observabilitySink.finishRequest({
          requestId,
          status: 'done',
          stopReason: null,
          finishedAt: new Date(),
          promptText,
          completionText,
          providerUsage: draftResult.providerUsage,
          usageSnapshot: {
            stage: workflowStage,
            summary: draftResult.summary,
          },
          parseWarningCount: warningCount,
          draftReady,
          draftComponentCount,
        });
        persistConversationContext();
      }
    }
  } catch (error: any) {
    const stopReason = lifecycle.getStopReason();
    await handleCopilotStopOrError(deps, {
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
    });
    if (requestId) {
      await deps.observabilitySink.finishRequest({
        requestId,
        status:
          stopReason === 'cancel' || stopReason === 'disconnect'
            ? 'cancelled'
            : stopReason === 'disconnect_timeout'
              ? 'disconnect_timeout'
              : timeoutTriggered || stopReason === 'timeout'
                ? 'timeout'
                : 'error',
        stopReason:
          stopReason === 'cancel' ||
          stopReason === 'disconnect' ||
          stopReason === 'disconnect_timeout' ||
          stopReason === 'timeout'
            ? stopReason
            : null,
        finishedAt: new Date(),
        promptText,
        completionText,
        usageSnapshot: {
          stage: workflowStage || null,
          error: error?.message || 'unknown_error',
        },
        parseWarningCount: warningCount,
        draftReady,
        draftComponentCount,
      });
    }
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
