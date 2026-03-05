import { buildFocusedSlice } from '@/service/ai/context/focused-slice-builder';

describe('focused-slice-builder', () => {
  it('includes focused question, neighbors and referenced questions', () => {
    const focusedSlice = buildFocusedSlice({
      intent: 'edit',
      generateStage: 'generate',
      questionnaireId: 1,
      baseVersion: 1,
      instruction: '把第3题语气改正式，并参考第1题的表述',
      focusedComponentId: 'q3',
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
            props: { options: ['A'] },
          },
          {
            fe_id: 'q2',
            type: 'questionRadio',
            title: '第二题',
            props: { options: ['B'] },
          },
          {
            fe_id: 'q3',
            type: 'questionTextArea',
            title: '第三题',
            props: { placeholder: '请输入' },
          },
          {
            fe_id: 'q4',
            type: 'questionCheckbox',
            title: '第四题',
            props: { options: ['C'] },
          },
        ],
      },
      model: undefined,
      conversationId: undefined,
    });

    expect(focusedSlice?.focused).toEqual(
      expect.objectContaining({
        questionNumber: 3,
        fe_id: 'q3',
      }),
    );
    expect(focusedSlice?.neighbors.map((item) => item.fe_id)).toEqual([
      'q2',
      'q4',
    ]);
    expect(focusedSlice?.referenced.map((item) => item.fe_id)).toEqual(['q1']);
  });
});
