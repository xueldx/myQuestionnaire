import {
  getComposerGuide,
  shouldConfirmDraftRegenerate
} from '@/pages/question/Edit/hooks/aiDraftInteraction'

describe('aiDraftInteraction', () => {
  it('describes pending draft edit as continuing the draft instead of editing the formal questionnaire', () => {
    const guide = getComposerGuide({
      mode: 'edit',
      hasPendingDraft: true,
      hasQuestionnaireContent: true
    })

    expect(guide.targetLabel).toBe('AI 草稿（未应用）')
    expect(guide.effectLabel).toContain('继续修改这份草稿')
    expect(guide.modeLabels.edit).toBe('继续修改')
  })

  it('treats generate with a pending draft as appending to the current draft', () => {
    const guide = getComposerGuide({
      mode: 'generate',
      hasPendingDraft: true,
      hasQuestionnaireContent: true
    })

    expect(guide.effectLabel).toContain('继续追加内容')
    expect(guide.tone).toBe('info')
    expect(guide.modeLabels.generate).toBe('继续追加')
    expect(shouldConfirmDraftRegenerate({ mode: 'generate', hasPendingDraft: true })).toBe(true)
  })

  it('keeps the empty-questionnaire generate guidance when no pending draft exists', () => {
    const guide = getComposerGuide({
      mode: 'generate',
      hasPendingDraft: false,
      hasQuestionnaireContent: false
    })

    expect(guide.targetLabel).toBe('正式问卷')
    expect(guide.effectLabel).toBe('发送后会生成一份新的 AI 草稿')
    expect(guide.modeLabels.generate).toBe('生成')
  })
})
