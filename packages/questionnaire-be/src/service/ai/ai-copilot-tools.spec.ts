import { collectToolContext } from '@/service/ai/ai-copilot-tools';

describe('collectToolContext', () => {
  const deps = {
    createToolCallId: jest.fn((toolName: string) => `${toolName}-call`),
    buildComponentCatalogPayload: jest.fn(() => [{ type: 'questionRadio' }]),
    sanitizeToolPreview: jest.fn((payload: unknown) => JSON.stringify(payload)),
    getEnhancedStats: jest.fn().mockResolvedValue(null),
    persistConversationMessage: jest.fn().mockResolvedValue(undefined),
  };
  const sink = {
    emit: jest.fn(),
    isClientConnected: jest.fn(() => true),
  };
  const dto = {
    questionnaireId: 1,
    instruction: '请优化当前问卷',
    originalInstruction: '',
    questionnaire: {
      title: '问卷',
      description: '',
      footerText: '',
      components: [],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps questionnaire snapshot tool in baseline strategy', async () => {
    const result = await collectToolContext(deps as any, {
      dto: dto as any,
      conversationId: 1,
      sink: sink as any,
      shouldStop: () => false,
      contextStrategy: 'baseline_v1',
    });

    expect(result.map((item) => item.name)).toContain(
      'get_questionnaire_snapshot',
    );
  });

  it('skips questionnaire snapshot tool in window_summary_outline_v1', async () => {
    const result = await collectToolContext(deps as any, {
      dto: dto as any,
      conversationId: 1,
      sink: sink as any,
      shouldStop: () => false,
      contextStrategy: 'window_summary_outline_v1',
    });

    expect(result.map((item) => item.name)).not.toContain(
      'get_questionnaire_snapshot',
    );
    expect(result.map((item) => item.name)).toContain('get_component_catalog');
  });
});
