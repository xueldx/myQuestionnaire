import { ComponentInfoType } from '@/store/modules/componentsSlice'
import { normalizeQuestionnaireComponentList } from '@/utils/normalizeQuestionComponent'
import {
  QuestionnaireDraft,
  QuestionnairePatch,
  QuestionnairePatchSet,
  QuestionnaireSnapshot
} from '@/pages/question/Edit/components/aiCopilotTypes'

type BuildQuestionnairePatchSetParams = {
  baseQuestionnaire: QuestionnaireSnapshot
  draftQuestionnaire: QuestionnaireDraft
  baseVersion: number
}

type ApplyQuestionnairePatchSetParams = {
  questionnaire: QuestionnaireSnapshot
  patchSet: QuestionnairePatchSet
  selectedPatchIds?: string[]
}

type ApplyQuestionnairePatchSetResult = {
  questionnaire: QuestionnaireDraft
  appliedPatchIds: string[]
  skippedPatchIds: string[]
}

export type QuestionnairePatchStatus = 'pending' | 'selected' | 'applied' | 'rejected'
export type QuestionnairePatchReviewMode = 'generate' | 'edit'

const stringifyValue = (value: unknown) => JSON.stringify(value ?? null)

const cloneComponent = (component: ComponentInfoType): ComponentInfoType => ({
  fe_id: component.fe_id,
  type: component.type,
  title: component.title,
  props: JSON.parse(JSON.stringify(component.props || {}))
})

const isAddPatch = (
  patch: QuestionnairePatch
): patch is Extract<QuestionnairePatch, { type: 'add' }> => patch.type === 'add'

const normalizeQuestionnaire = (
  questionnaire: QuestionnaireSnapshot | QuestionnaireDraft
): QuestionnaireDraft => ({
  title: questionnaire.title || '未命名问卷',
  description: questionnaire.description || '',
  footerText: questionnaire.footerText || '',
  components: normalizeQuestionnaireComponentList(questionnaire.components || []).map(component =>
    cloneComponent(component)
  )
})

const hasQuestionChanged = (current: ComponentInfoType, next: ComponentInfoType) =>
  current.type !== next.type ||
  current.title !== next.title ||
  stringifyValue(current.props) !== stringifyValue(next.props)

const buildPageConfigPatch = (
  baseQuestionnaire: QuestionnaireDraft,
  draftQuestionnaire: QuestionnaireDraft
) => {
  const changes: Partial<Pick<QuestionnaireDraft, 'title' | 'description' | 'footerText'>> = {}

  if (baseQuestionnaire.title !== draftQuestionnaire.title) {
    changes.title = draftQuestionnaire.title
  }
  if (baseQuestionnaire.description !== draftQuestionnaire.description) {
    changes.description = draftQuestionnaire.description
  }
  if (baseQuestionnaire.footerText !== draftQuestionnaire.footerText) {
    changes.footerText = draftQuestionnaire.footerText
  }

  return Object.keys(changes).length > 0
    ? ({
        id: 'page_config',
        type: 'page_config',
        changes
      } as QuestionnairePatch)
    : null
}

export const buildQuestionnairePatchSet = ({
  baseQuestionnaire,
  draftQuestionnaire,
  baseVersion
}: BuildQuestionnairePatchSetParams): QuestionnairePatchSet => {
  const normalizedBase = normalizeQuestionnaire(baseQuestionnaire)
  const normalizedDraft = normalizeQuestionnaire(draftQuestionnaire)
  const patches: QuestionnairePatch[] = []
  const pageConfigPatch = buildPageConfigPatch(normalizedBase, normalizedDraft)
  const baseComponentMap = new Map(
    normalizedBase.components.map(component => [component.fe_id, component])
  )
  const draftComponentMap = new Map(
    normalizedDraft.components.map(component => [component.fe_id, component])
  )

  if (pageConfigPatch) {
    patches.push(pageConfigPatch)
  }

  normalizedDraft.components.forEach((component, index) => {
    const baseComponent = baseComponentMap.get(component.fe_id)

    if (!baseComponent) {
      const previousBaseComponent =
        normalizedDraft.components
          .slice(0, index)
          .reverse()
          .find(candidate => baseComponentMap.has(candidate.fe_id)) || null
      const nextBaseComponent =
        normalizedDraft.components
          .slice(index + 1)
          .find(candidate => baseComponentMap.has(candidate.fe_id)) || null

      patches.push({
        id: `add:${component.fe_id}`,
        type: 'add',
        question: cloneComponent(component),
        afterQuestionId: previousBaseComponent?.fe_id || null,
        beforeQuestionId: nextBaseComponent?.fe_id || null
      })
      return
    }

    if (hasQuestionChanged(baseComponent, component)) {
      patches.push({
        id: `update:${component.fe_id}`,
        type: 'update',
        targetQuestionId: component.fe_id,
        question: cloneComponent(component)
      })
    }
  })

  normalizedBase.components.forEach(component => {
    if (draftComponentMap.has(component.fe_id)) return

    patches.push({
      id: `delete:${component.fe_id}`,
      type: 'delete',
      targetQuestionId: component.fe_id,
      previousQuestion: cloneComponent(component)
    })
  })

  return {
    baseVersion,
    baseQuestionnaire: normalizedBase,
    patches
  }
}

const getOrderedSiblingAddPatches = (
  patchSet: QuestionnairePatchSet,
  patch: Extract<QuestionnairePatch, { type: 'add' }>
) =>
  patchSet.patches.filter(
    candidate =>
      isAddPatch(candidate) &&
      candidate.afterQuestionId === patch.afterQuestionId &&
      candidate.beforeQuestionId === patch.beforeQuestionId
  )

const getStableInsertionIndex = (
  componentList: ComponentInfoType[],
  patchSet: QuestionnairePatchSet,
  patch: Extract<QuestionnairePatch, { type: 'add' }>
) => {
  const siblingAddPatches = getOrderedSiblingAddPatches(patchSet, patch)
  const patchIndex = siblingAddPatches.findIndex(candidate => candidate.id === patch.id)

  if (patchIndex < 0) return null

  for (let cursor = patchIndex - 1; cursor >= 0; cursor -= 1) {
    const previousSiblingId = siblingAddPatches[cursor].question.fe_id
    const previousSiblingIndex = componentList.findIndex(
      component => component.fe_id === previousSiblingId
    )

    if (previousSiblingIndex >= 0) {
      return previousSiblingIndex + 1
    }
  }

  for (let cursor = patchIndex + 1; cursor < siblingAddPatches.length; cursor += 1) {
    const nextSiblingId = siblingAddPatches[cursor].question.fe_id
    const nextSiblingIndex = componentList.findIndex(component => component.fe_id === nextSiblingId)

    if (nextSiblingIndex >= 0) {
      return nextSiblingIndex
    }
  }

  return null
}

const insertComponentByAnchor = (
  componentList: ComponentInfoType[],
  patchSet: QuestionnairePatchSet,
  patch: Extract<QuestionnairePatch, { type: 'add' }>
) => {
  if (componentList.some(component => component.fe_id === patch.question.fe_id)) {
    return {
      componentList,
      applied: false
    }
  }

  const nextComponentList = [...componentList]
  const nextComponent = cloneComponent(patch.question)
  const stableInsertionIndex = getStableInsertionIndex(nextComponentList, patchSet, patch)
  const afterIndex =
    patch.afterQuestionId == null
      ? -1
      : nextComponentList.findIndex(component => component.fe_id === patch.afterQuestionId)
  const beforeIndex =
    patch.beforeQuestionId == null
      ? -1
      : nextComponentList.findIndex(component => component.fe_id === patch.beforeQuestionId)

  if (stableInsertionIndex != null) {
    nextComponentList.splice(stableInsertionIndex, 0, nextComponent)
  } else if (beforeIndex >= 0) {
    nextComponentList.splice(beforeIndex, 0, nextComponent)
  } else if (afterIndex >= 0) {
    nextComponentList.splice(afterIndex + 1, 0, nextComponent)
  } else if (patch.afterQuestionId == null && patch.beforeQuestionId == null) {
    nextComponentList.push(nextComponent)
  } else if (patch.afterQuestionId == null) {
    nextComponentList.unshift(nextComponent)
  } else {
    nextComponentList.push(nextComponent)
  }

  return {
    componentList: nextComponentList,
    applied: true
  }
}

export const applyQuestionnairePatchSet = ({
  questionnaire,
  patchSet,
  selectedPatchIds
}: ApplyQuestionnairePatchSetParams): ApplyQuestionnairePatchSetResult => {
  const normalizedQuestionnaire = normalizeQuestionnaire(questionnaire)
  const targetPatchIds = new Set(selectedPatchIds || patchSet.patches.map(patch => patch.id))
  const appliedPatchIds: string[] = []
  const skippedPatchIds: string[] = []
  let nextQuestionnaire = normalizeQuestionnaire(normalizedQuestionnaire)

  patchSet.patches.forEach(patch => {
    if (!targetPatchIds.has(patch.id)) return

    if (patch.type === 'page_config') {
      nextQuestionnaire = {
        ...nextQuestionnaire,
        ...patch.changes
      }
      appliedPatchIds.push(patch.id)
      return
    }

    if (patch.type === 'add') {
      const result = insertComponentByAnchor(nextQuestionnaire.components, patchSet, patch)
      nextQuestionnaire = {
        ...nextQuestionnaire,
        components: result.componentList
      }
      if (result.applied) {
        appliedPatchIds.push(patch.id)
      } else {
        skippedPatchIds.push(patch.id)
      }
      return
    }

    if (patch.type === 'update') {
      const targetIndex = nextQuestionnaire.components.findIndex(
        component => component.fe_id === patch.targetQuestionId
      )
      if (targetIndex < 0) {
        skippedPatchIds.push(patch.id)
        return
      }

      const nextComponents = [...nextQuestionnaire.components]
      nextComponents[targetIndex] = cloneComponent({
        ...patch.question,
        fe_id: patch.targetQuestionId
      })
      nextQuestionnaire = {
        ...nextQuestionnaire,
        components: nextComponents
      }
      appliedPatchIds.push(patch.id)
      return
    }

    const targetIndex = nextQuestionnaire.components.findIndex(
      component => component.fe_id === patch.targetQuestionId
    )
    if (targetIndex < 0) {
      skippedPatchIds.push(patch.id)
      return
    }

    nextQuestionnaire = {
      ...nextQuestionnaire,
      components: nextQuestionnaire.components.filter(
        component => component.fe_id !== patch.targetQuestionId
      )
    }
    appliedPatchIds.push(patch.id)
  })

  return {
    questionnaire: {
      ...nextQuestionnaire,
      components: normalizeQuestionnaireComponentList(nextQuestionnaire.components)
    },
    appliedPatchIds,
    skippedPatchIds
  }
}

export const getPatchDisplayLabel = (patch: QuestionnairePatch) => {
  if (patch.type === 'page_config') {
    const changedFields = [
      patch.changes.title !== undefined ? '标题' : null,
      patch.changes.description !== undefined ? '描述' : null,
      patch.changes.footerText !== undefined ? '页脚' : null
    ].filter(Boolean)
    return changedFields.length > 0 ? `更新问卷${changedFields.join('、')}` : '更新问卷头部信息'
  }

  if (patch.type === 'add') {
    return `新增题目：${patch.question.title || '未命名题目'}`
  }

  if (patch.type === 'update') {
    return `更新题目：${patch.question.title || '未命名题目'}`
  }

  return `删除题目：${patch.previousQuestion.title || '未命名题目'}`
}

export const getDefaultSelectedPatchIds = (patchSet: QuestionnairePatchSet | null) =>
  patchSet?.patches.map(patch => patch.id) || []

export const getReviewablePatches = (
  mode: QuestionnairePatchReviewMode,
  patchSet: QuestionnairePatchSet | null
) => patchSet?.patches.filter(patch => !(mode === 'generate' && patch.type === 'page_config')) || []

export const reconcileSelectedPatchIds = (
  previousSelectedPatchIds: string[],
  patchSet: QuestionnairePatchSet | null
) => {
  const nextPatchIds = getDefaultSelectedPatchIds(patchSet)
  if (nextPatchIds.length === 0) return []
  if (previousSelectedPatchIds.length === 0) return nextPatchIds

  const retainedIds = previousSelectedPatchIds.filter(id => nextPatchIds.includes(id))
  const newIds = nextPatchIds.filter(id => !retainedIds.includes(id))
  return [...retainedIds, ...newIds]
}

export const isPatchAppliedToQuestionnaire = (
  questionnaire: QuestionnaireSnapshot | QuestionnaireDraft,
  patch: QuestionnairePatch
) => {
  const normalizedQuestionnaire = normalizeQuestionnaire(questionnaire)

  if (patch.type === 'page_config') {
    return (
      (patch.changes.title === undefined ||
        normalizedQuestionnaire.title === (patch.changes.title || '')) &&
      (patch.changes.description === undefined ||
        normalizedQuestionnaire.description === (patch.changes.description || '')) &&
      (patch.changes.footerText === undefined ||
        normalizedQuestionnaire.footerText === (patch.changes.footerText || ''))
    )
  }

  if (patch.type === 'add') {
    return normalizedQuestionnaire.components.some(
      component => component.fe_id === patch.question.fe_id
    )
  }

  if (patch.type === 'update') {
    const targetComponent = normalizedQuestionnaire.components.find(
      component => component.fe_id === patch.targetQuestionId
    )
    if (!targetComponent) return false
    return !hasQuestionChanged(targetComponent, patch.question)
  }

  return !normalizedQuestionnaire.components.some(
    component => component.fe_id === patch.targetQuestionId
  )
}

export const getPatchStatus = (
  questionnaire: QuestionnaireSnapshot | QuestionnaireDraft,
  patch: QuestionnairePatch,
  selectedPatchIds: string[],
  rejectedPatchIds: string[]
): QuestionnairePatchStatus => {
  if (isPatchAppliedToQuestionnaire(questionnaire, patch)) return 'applied'
  if (rejectedPatchIds.includes(patch.id)) return 'rejected'
  if (selectedPatchIds.includes(patch.id)) return 'selected'
  return 'pending'
}
