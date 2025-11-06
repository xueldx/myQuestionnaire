import { mergeGenerateDraftIntoBase } from '@/pages/question/Edit/hooks/aiGenerateDraftMerge'

const createComponent = (fe_id: string, title: string) => ({
  fe_id,
  type: 'questionRadio',
  title,
  props: {
    title,
    options: ['A', 'B']
  }
})

describe('aiGenerateDraftMerge', () => {
  it('keeps the previous pending draft and appends new additions after the selected anchor block', () => {
    const merged = mergeGenerateDraftIntoBase({
      baseDraft: {
        title: '门店满意度',
        description: 'base',
        footerText: '',
        components: [
          createComponent('c1', '基础信息'),
          createComponent('a1', '之前追加的问题'),
          createComponent('c2', '满意度评分')
        ]
      },
      additionDraft: {
        title: '门店满意度',
        description: 'base',
        footerText: '',
        components: [createComponent('a2', '本轮新追加的问题')]
      },
      selectedId: 'c1',
      currentComponents: [createComponent('c1', '基础信息'), createComponent('c2', '满意度评分')]
    })

    expect(merged.components.map(component => component.fe_id)).toEqual(['c1', 'a1', 'a2', 'c2'])
  })

  it('falls back to appending at the end when no current component is selected', () => {
    const merged = mergeGenerateDraftIntoBase({
      baseDraft: {
        title: '问卷',
        description: '',
        footerText: '',
        components: [createComponent('c1', '第一题')]
      },
      additionDraft: {
        title: '问卷',
        description: '',
        footerText: '',
        components: [createComponent('a1', '新增题目')]
      },
      selectedId: '',
      currentComponents: [createComponent('c1', '第一题')]
    })

    expect(merged.components.map(component => component.fe_id)).toEqual(['c1', 'a1'])
  })

  it('returns the newly generated draft directly when the base draft is empty', () => {
    const merged = mergeGenerateDraftIntoBase({
      baseDraft: {
        title: '未命名问卷',
        description: '',
        footerText: '',
        components: []
      },
      additionDraft: {
        title: '新问卷',
        description: 'desc',
        footerText: '',
        components: [createComponent('a1', '新增题目')]
      },
      selectedId: '',
      currentComponents: []
    })

    expect(merged.title).toBe('新问卷')
    expect(merged.components.map(component => component.fe_id)).toEqual(['a1'])
  })
})
