export const BASELINE_CONTEXT_STRATEGY = 'baseline_v1';
export const WINDOW_SUMMARY_OUTLINE_CONTEXT_STRATEGY =
  'window_summary_outline_v1';

export type CopilotContextStrategy =
  | typeof BASELINE_CONTEXT_STRATEGY
  | typeof WINDOW_SUMMARY_OUTLINE_CONTEXT_STRATEGY;

export const BASELINE_RECENT_WINDOW_SIZE = 12;
export const WINDOW_SUMMARY_RECENT_WINDOW_SIZE = 8;

export const resolveCopilotContextStrategy = (
  value?: string | null,
): CopilotContextStrategy =>
  value === WINDOW_SUMMARY_OUTLINE_CONTEXT_STRATEGY
    ? WINDOW_SUMMARY_OUTLINE_CONTEXT_STRATEGY
    : BASELINE_CONTEXT_STRATEGY;

export const getRecentWindowSize = (strategy: CopilotContextStrategy) =>
  strategy === WINDOW_SUMMARY_OUTLINE_CONTEXT_STRATEGY
    ? WINDOW_SUMMARY_RECENT_WINDOW_SIZE
    : BASELINE_RECENT_WINDOW_SIZE;
