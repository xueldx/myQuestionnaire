import {
  applyQuestionnairePatchSet,
  buildQuestionnairePatchSet,
  getReviewablePatches
} from '@/pages/question/Edit/hooks/aiQuestionPatch'

const createComponent = (fe_id: string, title: string) => ({
  fe_id,
  type: 'questionRadio',
  title,
  props: {
    title,
    options: ['A', 'B']
  }
})

describe('aiQuestionPatch', () => {
  it('keeps generated additions in the original draft order when they share the same anchors', () => {
    const baseQuestionnaire = {
      title: '睡眠调查',
      description: '',
      footerText: '',
      components: [createComponent('base-1', '已有题目'), createComponent('base-2', '睡眠习惯')]
    }

    const draftQuestionnaire = {
      title: '睡眠调查',
      description: '',
      footerText: '',
      components: [
        createComponent('base-1', '已有题目'),
        createComponent('add-1', '基本信息'),
        createComponent('add-2', '您的性别是?'),
        createComponent('add-3', '您所在的年级是?'),
        createComponent('base-2', '睡眠习惯')
      ]
    }

    const patchSet = buildQuestionnairePatchSet({
      baseQuestionnaire,
      draftQuestionnaire,
      baseVersion: 3
    })

    const result = applyQuestionnairePatchSet({
      questionnaire: baseQuestionnaire,
      patchSet
    })

    expect(result.questionnaire.components.map(component => component.title)).toEqual([
      '已有题目',
      '基本信息',
      '您的性别是?',
      '您所在的年级是?',
      '睡眠习惯'
    ])
  })

  it('keeps generated additions in the original draft order when the base questionnaire is empty', () => {
    const baseQuestionnaire = {
      title: '睡眠调查',
      description: '',
      footerText: '',
      components: []
    }

    const draftQuestionnaire = {
      title: '睡眠调查',
      description: '',
      footerText: '',
      components: [
        createComponent('add-1', '基本信息'),
        createComponent('add-2', '您的性别是?'),
        createComponent('add-3', '您所在的年级是?')
      ]
    }

    const patchSet = buildQuestionnairePatchSet({
      baseQuestionnaire,
      draftQuestionnaire,
      baseVersion: 1
    })

    const result = applyQuestionnairePatchSet({
      questionnaire: baseQuestionnaire,
      patchSet
    })

    expect(result.questionnaire.components.map(component => component.title)).toEqual([
      '基本信息',
      '您的性别是?',
      '您所在的年级是?'
    ])
  })

  it('keeps generated additions in the original draft order when appended after the last base question', () => {
    const baseQuestionnaire = {
      title: '睡眠调查',
      description: '',
      footerText: '',
      components: [createComponent('base-1', '已有题目')]
    }

    const draftQuestionnaire = {
      title: '睡眠调查',
      description: '',
      footerText: '',
      components: [
        createComponent('base-1', '已有题目'),
        createComponent('add-1', '您的性别是?'),
        createComponent('add-2', '您目前所在的年级是?'),
        createComponent('add-3', '你的专业类别是?')
      ]
    }

    const patchSet = buildQuestionnairePatchSet({
      baseQuestionnaire,
      draftQuestionnaire,
      baseVersion: 1
    })

    const result = applyQuestionnairePatchSet({
      questionnaire: baseQuestionnaire,
      patchSet
    })

    expect(result.questionnaire.components.map(component => component.title)).toEqual([
      '已有题目',
      '您的性别是?',
      '您目前所在的年级是?',
      '你的专业类别是?'
    ])
  })

  it('keeps generated additions in the original draft order after accepting same-anchor additions one by one', () => {
    const baseQuestionnaire = {
      title: '睡眠调查',
      description: '',
      footerText: '',
      components: [createComponent('base-1', '已有题目')]
    }

    const draftQuestionnaire = {
      title: '睡眠调查',
      description: '',
      footerText: '',
      components: [
        createComponent('base-1', '已有题目'),
        createComponent('add-1', '您的性别是?'),
        createComponent('add-2', '您目前所在的年级是?'),
        createComponent('add-3', '你的专业类别是?')
      ]
    }

    const patchSet = buildQuestionnairePatchSet({
      baseQuestionnaire,
      draftQuestionnaire,
      baseVersion: 1
    })

    const afterApplyingLast = applyQuestionnairePatchSet({
      questionnaire: baseQuestionnaire,
      patchSet,
      selectedPatchIds: ['add:add-3']
    }).questionnaire

    const afterApplyingFirst = applyQuestionnairePatchSet({
      questionnaire: afterApplyingLast,
      patchSet,
      selectedPatchIds: ['add:add-1']
    }).questionnaire

    const finalQuestionnaire = applyQuestionnairePatchSet({
      questionnaire: afterApplyingFirst,
      patchSet,
      selectedPatchIds: ['add:add-2']
    }).questionnaire

    expect(finalQuestionnaire.components.map(component => component.title)).toEqual([
      '已有题目',
      '您的性别是?',
      '您目前所在的年级是?',
      '你的专业类别是?'
    ])
  })

  it('does not treat generate-mode page config patches as reviewable items', () => {
    const baseQuestionnaire = {
      title: '',
      description: '',
      footerText: '',
      components: []
    }

    const draftQuestionnaire = {
      title: '大学生睡眠状况调查问卷',
      description: '用于了解睡眠情况',
      footerText: '',
      components: [createComponent('add-1', '您的性别是?')]
    }

    const patchSet = buildQuestionnairePatchSet({
      baseQuestionnaire,
      draftQuestionnaire,
      baseVersion: 1
    })

    expect(getReviewablePatches('generate', patchSet).map(patch => patch.id)).toEqual(['add:add-1'])
    expect(getReviewablePatches('edit', patchSet).map(patch => patch.id)).toEqual([
      'page_config',
      'add:add-1'
    ])
  })
})
