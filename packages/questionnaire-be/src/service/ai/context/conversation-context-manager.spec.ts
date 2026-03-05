import OpenAI from 'openai';
import {
  buildConversationPromptContext,
  persistConversationContextAfterSuccess,
  shouldCompactConversationHistory,
} from '@/service/ai/context/conversation-context-manager';
import { WINDOW_SUMMARY_OUTLINE_CONTEXT_STRATEGY } from '@/service/ai/context/context-strategy';

describe('conversation-context-manager', () => {
  const dto = {
    intent: 'edit',
    generateStage: 'generate',
    questionnaireId: 1,
    baseVersion: 1,
    instruction: '把第2题改成正式一点，并参考第1题',
    focusedComponentId: 'q2',
    originalInstruction: '',
    history: [
      { role: 'user' as const, content: '1' },
      { role: 'assistant' as const, content: '2' },
      { role: 'user' as const, content: '3' },
      { role: 'assistant' as const, content: '4' },
      { role: 'user' as const, content: '5' },
      { role: 'assistant' as const, content: '6' },
      { role: 'user' as const, content: '7' },
      { role: 'assistant' as const, content: '8' },
      { role: 'user' as const, content: '9' },
      { role: 'assistant' as const, content: '10' },
    ],
    questionnaire: {
      title: '问卷',
      description: '描述',
      footerText: '页脚',
      components: [
        {
          fe_id: 'q1',
          type: 'questionRadio',
          title: '第一题',
          props: { options: ['A'] },
        },
        {
          fe_id: 'q2',
          type: 'questionTextArea',
          title: '第二题',
          props: { placeholder: '请输入' },
        },
      ],
    },
  };

  it('builds recent window, summary and slice for new strategy', () => {
    const context = buildConversationPromptContext({
      contextStrategy: WINDOW_SUMMARY_OUTLINE_CONTEXT_STRATEGY,
      dto: dto as any,
      conversation: {
        id: 1,
        conversation_summary: '旧摘要',
        decision_memory: {
          goal: '旧目标',
        },
      },
    });

    expect(context.recentMessages).toHaveLength(8);
    expect(context.conversationSummary).toBe('旧摘要');
    expect(context.decisionMemory.goal).toBe('旧目标');
    expect(context.focusedSlice?.focused?.fe_id).toBe('q2');
  });

  it('does not compact when history count stays within recent window', () => {
    expect(
      shouldCompactConversationHistory({
        contextStrategy: WINDOW_SUMMARY_OUTLINE_CONTEXT_STRATEGY,
        history: dto.history.slice(0, 8),
        summaryMessageCount: 0,
      }),
    ).toBe(false);
  });

  it('does not compact when no new compactable history is added', () => {
    expect(
      shouldCompactConversationHistory({
        contextStrategy: WINDOW_SUMMARY_OUTLINE_CONTEXT_STRATEGY,
        history: dto.history,
        summaryMessageCount: 2,
      }),
    ).toBe(false);
  });

  it('compacts and persists summary only when new compactable history exists', async () => {
    const create = jest.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content:
              '{"summaryText":"新摘要","decisionMemory":{"goal":"新目标","audience":"","tone":"","must_have":[],"must_not":[],"accepted_changes":[],"rejected_changes":[],"pending_tasks":[]}}',
          },
        },
      ],
    });
    const client = {
      chat: {
        completions: {
          create,
        },
      },
    } as unknown as OpenAI;
    const loadConversationHistory = jest.fn().mockResolvedValue(dto.history);
    const sanitizeConversationHistory = jest.fn((messages) => messages);
    const loadConversationContext = jest.fn().mockResolvedValue({
      id: 1,
      conversation_summary: '旧摘要',
      decision_memory: {},
      summary_message_count: 0,
    });
    const updateConversationContext = jest.fn().mockResolvedValue(undefined);

    await persistConversationContextAfterSuccess({
      contextStrategy: WINDOW_SUMMARY_OUTLINE_CONTEXT_STRATEGY,
      conversation: {
        id: 1,
      },
      dto: dto as any,
      client,
      model: 'test-model',
      loadConversationHistory,
      sanitizeConversationHistory,
      loadConversationContext,
      updateConversationContext,
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(updateConversationContext).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        context_strategy: WINDOW_SUMMARY_OUTLINE_CONTEXT_STRATEGY,
        conversation_summary: '新摘要',
        summary_message_count: 2,
      }),
    );
  });
});
