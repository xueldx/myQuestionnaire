import { buildWindowedCopilotPrompt } from '@/service/ai/ai-prompt/build-windowed-copilot-prompt';

describe('build-windowed-copilot-prompt', () => {
  it('does not include the full questionnaire snapshot in prompt text', () => {
    const prompt = buildWindowedCopilotPrompt({
      dto: {
        intent: 'edit',
        generateStage: 'generate',
        questionnaireId: 1,
        baseVersion: 1,
        instruction: '请修改当前题目',
        focusedComponentId: 'q2',
        originalInstruction: '',
        history: [],
        questionnaire: {
          title: '问卷',
          description: '',
          footerText: '',
          components: [
            {
              fe_id: 'q1',
              type: 'questionRadio',
              title: '第一题',
              props: {
                options: ['A'],
                secret: 'SHOULD_NOT_APPEAR',
              },
            },
            {
              fe_id: 'q2',
              type: 'questionTextArea',
              title: '第二题',
              props: {
                placeholder: '请输入',
              },
            },
          ],
        },
      } as any,
      toolContextText: '无额外工具上下文',
      context: {
        conversationSummary: '旧摘要',
        decisionMemory: {
          goal: '优化问卷',
          audience: '',
          tone: '',
          must_have: [],
          must_not: [],
          accepted_changes: [],
          rejected_changes: [],
          pending_tasks: [],
        },
        recentMessages: [
          {
            role: 'user',
            content: '请改正式一点',
          },
        ],
        questionnaireOutline: {
          title: '问卷',
          description: '',
          footerText: '',
          componentCount: 2,
          components: [
            {
              fe_id: 'q1',
              type: 'questionRadio',
              title: '第一题',
            },
            {
              fe_id: 'q2',
              type: 'questionTextArea',
              title: '第二题',
            },
          ],
        },
        focusedSlice: {
          focused: {
            questionNumber: 2,
            fe_id: 'q2',
            type: 'questionTextArea',
            title: '第二题',
            props: {
              placeholder: '请输入',
            },
          },
          neighbors: [],
          referenced: [],
        },
      },
    });

    expect(prompt).toContain('[QUESTIONNAIRE OUTLINE]');
    expect(prompt).toContain('[FOCUSED SLICE]');
    expect(prompt).not.toContain('SHOULD_NOT_APPEAR');
  });
});
