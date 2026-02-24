import { buildAiPreviewCardEntries, resolveLatestPreviewTarget } from './aiInlinePreviewModel'
import { QuestionnaireDraft } from './aiCopilotTypes'

const createQuestion = (
  fe_id: string,
  title: string,
  extraProps: Record<string, unknown> = {}
) => ({
  fe_id,
  type: 'questionRadio',
  title,
  props: {
    title,
    options: [],
    ...extraProps
  }
})

const createDraft = (components: QuestionnaireDraft['components']): QuestionnaireDraft => ({
  title: '测试问卷',
  description: '测试描述',
  footerText: '',
  components
})

describe('aiInlinePreviewModel', () => {
  it('tracks the last generated addition after the selected anchor block', () => {
    const currentQuestionnaire = createDraft([
      createQuestion('q1', '原题一'),
      createQuestion('q2', '原题二')
    ])
    const previewDraft = createDraft([
      createQuestion('q1', '原题一'),
      createQuestion('q-new-1', '新增一'),
      createQuestion('q-new-2', '新增二'),
      createQuestion('q2', '原题二')
    ])

    const entries = buildAiPreviewCardEntries({
      mode: 'generate',
      currentQuestionnaire,
      previewDraft,
      selectedId: 'q1',
      patchStatusMap: {},
      isPartialDraft: true
    })

    expect(resolveLatestPreviewTarget(entries)?.cardId).toBe('add:q-new-2')
  })

  it('uses the last visual review card as the follow target in edit mode', () => {
    const currentQuestionnaire = createDraft([
      createQuestion('q1', '原题一'),
      createQuestion('q2', '原题二'),
      createQuestion('q3', '原题三')
    ])
    const previewDraft = createDraft([
      createQuestion('q1', '原题一（更新）'),
      createQuestion('q-new-1', '新增一'),
      createQuestion('q3', '原题三')
    ])

    const entries = buildAiPreviewCardEntries({
      mode: 'edit',
      currentQuestionnaire,
      previewDraft,
      selectedId: 'q1',
      patchStatusMap: {},
      isPartialDraft: false
    })

    expect(resolveLatestPreviewTarget(entries)?.cardId).toBe('delete:q2')
  })

  it('does not create a follow target when only page config changes', () => {
    const currentQuestionnaire = createDraft([createQuestion('q1', '原题一')])
    const previewDraft = {
      ...createDraft([createQuestion('q1', '原题一')]),
      title: '新的标题'
    }

    const entries = buildAiPreviewCardEntries({
      mode: 'edit',
      currentQuestionnaire,
      previewDraft,
      selectedId: 'q1',
      patchStatusMap: {},
      isPartialDraft: false
    })

    expect(resolveLatestPreviewTarget(entries)).toBeNull()
  })

  it('keeps the same target card id while the same suggestion card continues to grow', () => {
    const currentQuestionnaire = createDraft([createQuestion('q1', '原题一')])
    const firstPreviewDraft = createDraft([
      createQuestion('q1', '原题一（更新）', {
        options: [{ value: 'A', text: 'A' }]
      })
    ])
    const secondPreviewDraft = createDraft([
      createQuestion('q1', '原题一（更新）', {
        options: [
          { value: 'A', text: 'A' },
          { value: 'B', text: 'B' }
        ]
      })
    ])

    const firstTarget = resolveLatestPreviewTarget(
      buildAiPreviewCardEntries({
        mode: 'edit',
        currentQuestionnaire,
        previewDraft: firstPreviewDraft,
        selectedId: 'q1',
        patchStatusMap: {},
        isPartialDraft: true
      })
    )
    const secondTarget = resolveLatestPreviewTarget(
      buildAiPreviewCardEntries({
        mode: 'edit',
        currentQuestionnaire,
        previewDraft: secondPreviewDraft,
        selectedId: 'q1',
        patchStatusMap: {},
        isPartialDraft: true
      })
    )

    expect(firstTarget?.cardId).toBe('update:q1')
    expect(secondTarget?.cardId).toBe('update:q1')
    expect(firstTarget?.signature).not.toBe(secondTarget?.signature)
  })
})
