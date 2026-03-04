export type AiContextSnapshot = {
  historyMessageCount: number;
  questionnaireComponentCount: number;
  historyChars: number;
  questionnaireChars: number;
  toolContextChars: number;
  promptChars: number;
  hasFocusedComponent: boolean;
  hasAnswerStatsTool: boolean;
};

export type AiRequestMetricStatus =
  | 'running'
  | 'done'
  | 'error'
  | 'cancelled'
  | 'timeout'
  | 'disconnect_timeout';

export type AiRequestMetricStopReason =
  | 'cancel'
  | 'timeout'
  | 'disconnect'
  | 'disconnect_timeout'
  | null;

export type AiMetricOutcomePatch = {
  draftApplied?: boolean;
  discarded?: boolean;
  autoSaveSucceeded?: boolean;
  autoSaveFailed?: boolean;
};

export type AiObservabilityStartParams = {
  requestId: string;
  conversationId: number;
  questionnaireId: number;
  userId: number;
  intent: 'generate' | 'edit';
  workflowStage: 'polish' | 'generate' | 'edit';
  modelKey: string;
  providerBaseUrl: string;
  contextStrategy: string;
  startedAt: Date;
  contextSnapshot: AiContextSnapshot;
};

export type AiObservabilityFinishParams = {
  requestId: string;
  status: Exclude<AiRequestMetricStatus, 'running'>;
  stopReason: AiRequestMetricStopReason;
  finishedAt: Date;
  promptText: string;
  completionText: string;
  providerUsage?: Record<string, any> | null;
  usageSnapshot?: Record<string, any> | null;
  parseWarningCount?: number;
  draftReady?: boolean;
  draftComponentCount?: number;
};

export abstract class AiObservabilitySink {
  abstract startRequest(params: AiObservabilityStartParams): Promise<void>;

  abstract markFirstToken(params: {
    requestId: string;
    firstTokenAt: Date;
  }): Promise<void>;

  abstract finishRequest(params: AiObservabilityFinishParams): Promise<void>;

  abstract patchOutcome(params: {
    requestId: string;
    userId: number;
    outcome: AiMetricOutcomePatch;
  }): Promise<boolean>;
}

export const DEFAULT_AI_CONTEXT_STRATEGY = 'baseline_v1';
