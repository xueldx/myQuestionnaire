import OpenAI from 'openai';
import { SanitizedCopilotDto } from '@/service/ai/ai-copilot-sanitize';
import {
  DecisionMemory,
  EMPTY_DECISION_MEMORY,
  FocusedSlice,
  QuestionnaireOutline,
  SanitizedHistoryMessage,
} from '@/service/ai/context/context-types';
import {
  CopilotContextStrategy,
  getRecentWindowSize,
  WINDOW_SUMMARY_OUTLINE_CONTEXT_STRATEGY,
  WINDOW_SUMMARY_RECENT_WINDOW_SIZE,
} from '@/service/ai/context/context-strategy';
import { buildQuestionnaireOutline } from '@/service/ai/context/questionnaire-outline-builder';
import { buildFocusedSlice } from '@/service/ai/context/focused-slice-builder';
import {
  extractConversationSummary,
  normalizeDecisionMemory,
} from '@/service/ai/context/conversation-summary-extractor';

type ConversationRecordLike = {
  id: number;
  context_strategy?: string | null;
  conversation_summary?: string | null;
  decision_memory?: Record<string, any> | null;
  summary_message_count?: number | null;
};

type ConversationPromptContext = {
  contextStrategy: CopilotContextStrategy;
  recentMessages: SanitizedHistoryMessage[];
  conversationSummary: string;
  decisionMemory: DecisionMemory;
  questionnaireOutline: QuestionnaireOutline;
  focusedSlice: FocusedSlice | null;
};

export const buildConversationPromptContext = (params: {
  contextStrategy: CopilotContextStrategy;
  dto: SanitizedCopilotDto;
  conversation: ConversationRecordLike | null;
}): ConversationPromptContext => {
  const questionnaireOutline = buildQuestionnaireOutline(
    params.dto.questionnaire,
  );

  if (params.contextStrategy === WINDOW_SUMMARY_OUTLINE_CONTEXT_STRATEGY) {
    return {
      contextStrategy: params.contextStrategy,
      recentMessages: params.dto.history.slice(
        -WINDOW_SUMMARY_RECENT_WINDOW_SIZE,
      ),
      conversationSummary:
        params.conversation?.conversation_summary?.trim() || '',
      decisionMemory: normalizeDecisionMemory(
        params.conversation?.decision_memory || EMPTY_DECISION_MEMORY,
      ),
      questionnaireOutline,
      focusedSlice: buildFocusedSlice(params.dto),
    };
  }

  return {
    contextStrategy: params.contextStrategy,
    recentMessages: params.dto.history.slice(
      -getRecentWindowSize(params.contextStrategy),
    ),
    conversationSummary: '',
    decisionMemory: EMPTY_DECISION_MEMORY,
    questionnaireOutline,
    focusedSlice: null,
  };
};

export const getCompactableHistory = (history: SanitizedHistoryMessage[]) =>
  history.length > WINDOW_SUMMARY_RECENT_WINDOW_SIZE
    ? history.slice(0, -WINDOW_SUMMARY_RECENT_WINDOW_SIZE)
    : [];

export const shouldCompactConversationHistory = (params: {
  contextStrategy: CopilotContextStrategy;
  history: SanitizedHistoryMessage[];
  summaryMessageCount: number;
}) => {
  if (params.contextStrategy !== WINDOW_SUMMARY_OUTLINE_CONTEXT_STRATEGY) {
    return false;
  }

  const compactableHistory = getCompactableHistory(params.history);
  return compactableHistory.length > Math.max(0, params.summaryMessageCount);
};

export const persistConversationContextAfterSuccess = async (params: {
  contextStrategy: CopilotContextStrategy;
  conversation: ConversationRecordLike;
  dto: SanitizedCopilotDto;
  client: OpenAI;
  model: string;
  loadConversationHistory: (
    conversationId: number,
  ) => Promise<
    Array<
      Pick<{ role: 'user' | 'assistant'; content: string }, 'role' | 'content'>
    >
  >;
  sanitizeConversationHistory: (
    messages: Array<
      Pick<{ role: 'user' | 'assistant'; content: string }, 'role' | 'content'>
    >,
  ) => SanitizedHistoryMessage[];
  loadConversationContext: (
    conversationId: number,
  ) => Promise<ConversationRecordLike | null>;
  updateConversationContext: (
    conversationId: number,
    payload: Partial<ConversationRecordLike> & Record<string, any>,
  ) => Promise<void>;
  onError?: (error: unknown) => void;
}) => {
  const latestConversation =
    (await params.loadConversationContext(params.conversation.id)) ||
    params.conversation;
  const questionnaireOutline = buildQuestionnaireOutline(
    params.dto.questionnaire,
  );
  const basePayload = {
    context_strategy: params.contextStrategy,
    latest_questionnaire_outline: questionnaireOutline,
  };

  try {
    const history = params.sanitizeConversationHistory(
      await params.loadConversationHistory(params.conversation.id),
    );

    if (
      !shouldCompactConversationHistory({
        contextStrategy: params.contextStrategy,
        history,
        summaryMessageCount:
          Number(latestConversation.summary_message_count) || 0,
      })
    ) {
      await params.updateConversationContext(
        params.conversation.id,
        basePayload,
      );
      return;
    }

    const compactableHistory = getCompactableHistory(history);
    const summaryMessageCount = Math.max(
      0,
      Number(latestConversation.summary_message_count) || 0,
    );
    const newMessages = compactableHistory.slice(summaryMessageCount);

    if (newMessages.length === 0) {
      await params.updateConversationContext(
        params.conversation.id,
        basePayload,
      );
      return;
    }

    const compacted = await extractConversationSummary(
      params.client,
      params.model,
      {
        currentSummary: latestConversation.conversation_summary,
        currentDecisionMemory: latestConversation.decision_memory,
        newMessages,
      },
    );

    await params.updateConversationContext(params.conversation.id, {
      ...basePayload,
      conversation_summary: compacted.summaryText,
      decision_memory: compacted.decisionMemory,
      summary_message_count: compactableHistory.length,
      summary_updated_at: new Date(),
    });
  } catch (error) {
    try {
      await params.updateConversationContext(
        params.conversation.id,
        basePayload,
      );
    } catch (innerError) {
      params.onError?.(innerError);
    }
    params.onError?.(error);
  }
};
