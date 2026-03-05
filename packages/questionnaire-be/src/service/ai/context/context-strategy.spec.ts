import {
  BASELINE_CONTEXT_STRATEGY,
  resolveCopilotContextStrategy,
  WINDOW_SUMMARY_OUTLINE_CONTEXT_STRATEGY,
} from '@/service/ai/context/context-strategy';

describe('context-strategy', () => {
  it('falls back to baseline when config is empty or invalid', () => {
    expect(resolveCopilotContextStrategy(undefined)).toBe(
      BASELINE_CONTEXT_STRATEGY,
    );
    expect(resolveCopilotContextStrategy('unknown')).toBe(
      BASELINE_CONTEXT_STRATEGY,
    );
  });

  it('returns window_summary_outline_v1 when config explicitly matches', () => {
    expect(
      resolveCopilotContextStrategy(WINDOW_SUMMARY_OUTLINE_CONTEXT_STRATEGY),
    ).toBe(WINDOW_SUMMARY_OUTLINE_CONTEXT_STRATEGY);
  });
});
