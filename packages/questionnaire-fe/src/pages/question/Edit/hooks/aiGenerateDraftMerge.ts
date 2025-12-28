import { ComponentInfoType } from '@/store/modules/componentsSlice'
import { QuestionnaireDraft } from '@/pages/question/Edit/components/aiCopilotTypes'
import { claimUniqueComponentFeId } from '@/utils/componentId'
import { normalizeQuestionnaireComponentList } from '@/utils/normalizeQuestionComponent'

type MergeGenerateDraftOptions = {
  baseDraft: QuestionnaireDraft
  additionDraft: QuestionnaireDraft
  selectedId: string
  currentComponents: ComponentInfoType[]
}

const hasSameStructure = (left: ComponentInfoType, right: ComponentInfoType) =>
  left.type === right.type &&
  left.title === right.title &&
  JSON.stringify(left.props ?? null) === JSON.stringify(right.props ?? null)

const dedupeNewComponents = (
  baseComponents: ComponentInfoType[],
  additionComponents: ComponentInfoType[]
) => {
  const usedIds = new Set(baseComponents.map(component => component.fe_id))
  const baseComponentMap = new Map(baseComponents.map(component => [component.fe_id, component]))

  return additionComponents.reduce<ComponentInfoType[]>((result, component, index) => {
    const existingComponent = baseComponentMap.get(component.fe_id)

    if (existingComponent && hasSameStructure(existingComponent, component)) {
      return result
    }

    const nextId = claimUniqueComponentFeId(usedIds, component.fe_id, `ai-generate-${index + 1}`)

    result.push(nextId === component.fe_id ? component : { ...component, fe_id: nextId })
    return result
  }, [])
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
