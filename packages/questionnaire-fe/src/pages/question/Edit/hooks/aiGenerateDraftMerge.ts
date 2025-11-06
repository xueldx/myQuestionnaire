import { ComponentInfoType } from '@/store/modules/componentsSlice'
import { QuestionnaireDraft } from '@/pages/question/Edit/components/aiCopilotTypes'
import { normalizeQuestionnaireComponentList } from '@/utils/normalizeQuestionComponent'

type MergeGenerateDraftOptions = {
  baseDraft: QuestionnaireDraft
  additionDraft: QuestionnaireDraft
  selectedId: string
  currentComponents: ComponentInfoType[]
}

const dedupeNewComponents = (
  baseComponents: ComponentInfoType[],
  additionComponents: ComponentInfoType[]
) => {
  const baseIds = new Set(baseComponents.map(component => component.fe_id))
  return additionComponents.filter(component => !baseIds.has(component.fe_id))
}

const getGenerateInsertionIndex = (
  baseComponents: ComponentInfoType[],
  selectedId: string,
  currentComponents: ComponentInfoType[]
) => {
  if (baseComponents.length === 0) return 0
  if (!selectedId) return baseComponents.length

  const currentComponentIds = new Set(currentComponents.map(component => component.fe_id))
  if (!currentComponentIds.has(selectedId)) return baseComponents.length

  const anchorIndex = baseComponents.findIndex(component => component.fe_id === selectedId)
  if (anchorIndex < 0) return baseComponents.length

  let cursor = anchorIndex + 1
  while (cursor < baseComponents.length && !currentComponentIds.has(baseComponents[cursor].fe_id)) {
    cursor += 1
  }

  return cursor
}

export const mergeGenerateDraftIntoBase = ({
  baseDraft,
  additionDraft,
  selectedId,
  currentComponents
}: MergeGenerateDraftOptions): QuestionnaireDraft => {
  const normalizedBaseComponents = normalizeQuestionnaireComponentList(baseDraft.components || [])
  const normalizedAdditionComponents = normalizeQuestionnaireComponentList(
    additionDraft.components || []
  )
  const nextAdditions = dedupeNewComponents(normalizedBaseComponents, normalizedAdditionComponents)

  if (normalizedBaseComponents.length === 0) {
    return {
      title: additionDraft.title || baseDraft.title,
      description: additionDraft.description || baseDraft.description,
      footerText: additionDraft.footerText || baseDraft.footerText,
      components: nextAdditions
    }
  }

  if (nextAdditions.length === 0) {
    return {
      title: additionDraft.title || baseDraft.title,
      description: additionDraft.description || baseDraft.description,
      footerText: additionDraft.footerText || baseDraft.footerText,
      components: normalizedBaseComponents
    }
  }

  const insertionIndex = getGenerateInsertionIndex(
    normalizedBaseComponents,
    selectedId,
    currentComponents
  )

  return {
    title: additionDraft.title || baseDraft.title,
    description: additionDraft.description || baseDraft.description,
    footerText: additionDraft.footerText || baseDraft.footerText,
    components: [
      ...normalizedBaseComponents.slice(0, insertionIndex),
      ...nextAdditions,
      ...normalizedBaseComponents.slice(insertionIndex)
    ]
  }
}

export const generateDraftContainsCurrentComponents = (
  draft: QuestionnaireDraft | null,
  currentComponents: ComponentInfoType[]
) => {
  if (!draft || currentComponents.length === 0) return false
  const draftIds = new Set((draft.components || []).map(component => component.fe_id))
  return currentComponents.some(component => draftIds.has(component.fe_id))
}
