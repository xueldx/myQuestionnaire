import { buildQuestionnaireOutline } from '@/service/ai/context/questionnaire-outline-builder';

describe('questionnaire-outline-builder', () => {
  it('builds a lightweight outline without leaking props', () => {
    const outline = buildQuestionnaireOutline({
      title: '满意度问卷',
      description: '描述',
      footerText: '感谢填写',
      components: [
        {
          fe_id: 'q1',
          type: 'questionRadio',
          title: '你的专业是？',
          props: {
            options: ['A', 'B'],
            secret: 'should-not-leak',
          },
        },
      ],
    });

    expect(outline).toEqual({
      title: '满意度问卷',
      description: '描述',
      footerText: '感谢填写',
      componentCount: 1,
      components: [
        {
          fe_id: 'q1',
          type: 'questionRadio',
          title: '你的专业是？',
        },
      ],
    });
    expect(JSON.stringify(outline)).not.toContain('should-not-leak');
  });
});
