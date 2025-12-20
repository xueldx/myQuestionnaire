import { QuestionComponent } from '@/common/schemas/question-detail.schema';
import { QuestionnaireSnapshot } from '@/service/ai/dto/copilot-stream.dto';
import { ParsedCopilotBlocks } from '@/service/ai/utils/parse-copilot-blocks';
import { normalizeDraft } from '@/service/ai/utils/draft-normalizer';

const createComponent = (fe_id: string, title: string): QuestionComponent => ({
  fe_id,
  type: 'questionRadio',
  title,
  props: {
    title,
    options: ['A', 'B'],
  },
});

const createParsedDraft = (
  components: QuestionComponent[],
  pageConfig?: Partial<Record<'title' | 'description' | 'footerText', string>>,
): ParsedCopilotBlocks => ({
  assistantReply: '',
  pageConfig: {
    title: pageConfig?.title || '测试问卷',
    description: pageConfig?.description || '',
    footerText: pageConfig?.footerText || '',
  },
  components,
  endDraftReached: true,
  errors: [],
  warnings: [],
});

const createSnapshot = (components: QuestionComponent[]): QuestionnaireSnapshot => ({
  title: '测试问卷',
  description: '',
  footerText: '',
  components,
});

describe('draft-normalizer', () => {
  it('reassigns a new fe_id for generate-mode additions that collide with existing snapshot ids', () => {
    const snapshot = createSnapshot([createComponent('q1', '已有题目')]);

    const draft = normalizeDraft(
      createParsedDraft([createComponent('q1', '本轮新增题目')]),
      snapshot,
      'generate',
    );

    expect(draft.components).toHaveLength(1);
    expect(draft.components[0].title).toBe('本轮新增题目');
    expect(draft.components[0].fe_id).not.toBe('q1');
  });

  it('reassigns duplicate fe_id values inside the same generate draft', () => {
    const draft = normalizeDraft(
      createParsedDraft([
        createComponent('dup-id', '第一题'),
        createComponent('dup-id', '第二题'),
      ]),
      createSnapshot([]),
      'generate',
    );

    expect(draft.components).toHaveLength(2);
    expect(new Set(draft.components.map((component) => component.fe_id)).size).toBe(2);
  });

  it('keeps the first matched edit component id and reassigns later duplicates as new additions', () => {
    const snapshot = createSnapshot([
      createComponent('q1', '原题一'),
      createComponent('q2', '原题二'),
    ]);

    const draft = normalizeDraft(
      createParsedDraft([
        createComponent('q1', '更新后的原题一'),
        createComponent('q1', '本轮新增题目'),
      ]),
      snapshot,
      'edit',
    );

    expect(draft.components).toHaveLength(3);
    expect(draft.components[0].fe_id).toBe('q1');
    expect(draft.components[0].title).toBe('更新后的原题一');
    expect(draft.components[1].title).toBe('本轮新增题目');
    expect(draft.components[1].fe_id).not.toBe('q1');
    expect(draft.components[1].fe_id).not.toBe('q2');
    expect(draft.components[2].fe_id).toBe('q2');
  });

  it('rebinds an explicit "第N题" edit back to the referenced snapshot fe_id when AI returns a wrong fe_id', () => {
    const snapshot = createSnapshot([
      createComponent('q1', '原题一'),
      createComponent('q2', '原题二'),
      createComponent('q3', '原题三'),
    ]);

    const draft = normalizeDraft(
      createParsedDraft([createComponent('wrong-id', '更新后的原题三')]),
      snapshot,
      'edit',
      '把第3题改成多选',
    );

    expect(draft.components[2].fe_id).toBe('q3');
    expect(draft.components[2].title).toBe('更新后的原题三');
  });

  it('keeps explicit referenced edits bound first and leaves later unmatched components as additions', () => {
    const snapshot = createSnapshot([
      createComponent('q1', '原题一'),
      createComponent('q2', '原题二'),
    ]);

    const draft = normalizeDraft(
      createParsedDraft([
        createComponent('wrong-id', '更新后的原题二'),
        createComponent('another-wrong-id', '新增评分题'),
      ]),
      snapshot,
      'edit',
      '把第2题改成评分题，再补一题满意度题',
    );

    expect(draft.components[1].fe_id).toBe('q2');
    const additions = draft.components.filter(
      (component) => component.fe_id !== 'q1' && component.fe_id !== 'q2',
    );
    expect(additions).toHaveLength(1);
    expect(additions[0].title).toBe('新增评分题');
  });

  it('rebinds a focused edit back to the selected snapshot fe_id when AI returns a random id', () => {
    const snapshot = createSnapshot([
      createComponent('q1', '原题一'),
      createComponent('q2', '原题二'),
      createComponent('q3', '原题三'),
    ]);

    const draft = normalizeDraft(
      createParsedDraft([createComponent('wrong-id', '更新后的原题二')]),
      snapshot,
      'edit',
      '',
      'q2',
    );

    expect(draft.components[1].fe_id).toBe('q2');
    expect(draft.components[1].title).toBe('更新后的原题二');
  });

  it('prioritizes the focused snapshot fe_id over other existing ids returned by AI', () => {
    const snapshot = createSnapshot([
      createComponent('q1', '原题一'),
      createComponent('q2', '原题二'),
      createComponent('q3', '原题三'),
    ]);

    const draft = normalizeDraft(
      createParsedDraft([
        createComponent('q1', '更新后的原题二'),
        createComponent('q1', '多余返回'),
      ]),
      snapshot,
      'edit',
      '',
      'q2',
    );

    expect(draft.components[1].fe_id).toBe('q2');
    expect(draft.components[1].title).toBe('更新后的原题二');
    const additions = draft.components.filter(
      (component) => !['q1', 'q2', 'q3'].includes(component.fe_id),
    );
    expect(additions).toHaveLength(1);
    expect(additions[0].title).toBe('多余返回');
  });
});
