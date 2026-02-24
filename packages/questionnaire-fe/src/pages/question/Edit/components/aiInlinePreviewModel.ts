import { ComponentInfoType } from '@/store/modules/componentsSlice'
import { QuestionnairePatchStatus } from '../hooks/aiQuestionPatch'
import { generateDraftContainsCurrentComponents } from '../hooks/aiGenerateDraftMerge'
import { AiCopilotIntent, QuestionnaireDraft } from './aiCopilotTypes'
import { AnnotationTone, buildAddedInsertMap, hasComponentChanged } from './aiInlinePreviewUtils'

export type AiPreviewCardEntry = {
  cardId: string
  feId: string
  component: ComponentInfoType
  label: string
  note?: string
  tone: AnnotationTone
  selected: boolean
  selectedAccent: 'green' | 'red'
  patchId: string | null
  patchStatus: QuestionnairePatchStatus | null
  isSelectable: boolean
  isAiSuggestion: boolean
  isLatestTargetCandidate: boolean
  visualOrder: number
}

type BuildAiPreviewCardEntriesParams = {
  mode: AiCopilotIntent
  currentQuestionnaire: QuestionnaireDraft
  previewDraft: QuestionnaireDraft
  selectedId: string
  patchStatusMap: Record<string, QuestionnairePatchStatus>
  isPartialDraft: boolean
}

type BuildReadonlyPreviewEntriesParams = {
  questionnaire: QuestionnaireDraft
  selectedId: string
  note: string
  cardIdPrefix: string
}

export type AiPreviewLatestTarget = {
  cardId: string
  signature: string
}

const buildCardSignature = (card: AiPreviewCardEntry) =>
  [
    card.cardId,
    card.component.type,
    card.component.title,
    JSON.stringify(card.component.props ?? null)
  ].join('|')

const getPatchStatus = (
  patchStatusMap: Record<string, QuestionnairePatchStatus>,
  patchId: string | null
) => (patchId ? patchStatusMap[patchId] || 'pending' : null)

const createCardEntry = (
  nextVisualOrder: number,
  entry: Omit<AiPreviewCardEntry, 'visualOrder' | 'selectedAccent' | 'patchStatus'> & {
    selectedAccent?: 'green' | 'red'
    patchStatusMap: Record<string, QuestionnairePatchStatus>
  }
): AiPreviewCardEntry => ({
  ...entry,
  selectedAccent: entry.selectedAccent || 'green',
  patchStatus: getPatchStatus(entry.patchStatusMap, entry.patchId),
  visualOrder: nextVisualOrder
})

export const buildAiPreviewCardEntries = ({
  mode,
  currentQuestionnaire,
  previewDraft,
  selectedId,
  patchStatusMap,
  isPartialDraft
}: BuildAiPreviewCardEntriesParams) => {
  const currentComponents = currentQuestionnaire.components || []
  const draftComponents = previewDraft.components || []
  const draftIndexMap = new Map(draftComponents.map((component, index) => [component.fe_id, index]))
  const draftComponentMap = new Map(draftComponents.map(component => [component.fe_id, component]))
  const addedInsertMap =
    mode === 'edit' ? buildAddedInsertMap(currentComponents, draftComponents) : new Map()
  const generateDraftHasBaseComponents =
    mode === 'generate' && generateDraftContainsCurrentComponents(previewDraft, currentComponents)
  const generateAddedInsertMap =
    mode === 'generate' && generateDraftHasBaseComponents
      ? buildAddedInsertMap(currentComponents, draftComponents)
      : new Map<string, ComponentInfoType[]>()
  const anchorIndex =
    selectedId == null
      ? -1
      : currentComponents.findIndex(component => component.fe_id === selectedId)
  const generateInsertIndex = anchorIndex >= 0 ? anchorIndex + 1 : currentComponents.length
  const entries: AiPreviewCardEntry[] = []

  const pushEntry = (
    entry: Omit<AiPreviewCardEntry, 'visualOrder' | 'selectedAccent' | 'patchStatus'> & {
      selectedAccent?: 'green' | 'red'
    }
  ) => {
    entries.push(
      createCardEntry(entries.length, {
        ...entry,
        patchStatusMap
      })
    )
  }

  const pushAddedEntries = (
    components: ComponentInfoType[],
    buildNote: (component: ComponentInfoType, index: number) => string
  ) => {
    components.forEach(component => {
      pushEntry({
        cardId: `add:${component.fe_id}`,
        feId: component.fe_id,
        component,
        tone: 'suggestion',
        label: `AI 建议新增（应用后第 ${(draftIndexMap.get(component.fe_id) || 0) + 1} 项）`,
        note: buildNote(component, draftIndexMap.get(component.fe_id) || 0),
        patchId: `add:${component.fe_id}`,
        isSelectable: false,
        isAiSuggestion: true,
        isLatestTargetCandidate: true,
        selected: false
      })
    })
  }

  if (generateDraftHasBaseComponents && generateAddedInsertMap.get('__start__')?.length) {
    pushAddedEntries(generateAddedInsertMap.get('__start__') || [], () => '将插入到问卷开头')
  }

  if (mode === 'edit' && addedInsertMap.get('__start__')?.length) {
    pushAddedEntries(addedInsertMap.get('__start__') || [], () => '将插入到问卷开头')
  }

  currentComponents.forEach((component, index) => {
    const draftComponent = draftComponentMap.get(component.fe_id)
    const draftPosition = draftIndexMap.get(component.fe_id)
    const isChanged =
      !!draftComponent && mode === 'edit' && hasComponentChanged(component, draftComponent)
    const isDeleted = mode === 'edit' && !isPartialDraft && !draftComponent
    const generateInsertHere = mode === 'generate' && anchorIndex === index
    const addedAfterCurrent =
      mode === 'edit'
        ? addedInsertMap.get(component.fe_id) || []
        : generateDraftHasBaseComponents
        ? generateAddedInsertMap.get(component.fe_id) || []
        : []

    pushEntry({
      cardId: `${isDeleted ? 'delete' : 'current'}:${component.fe_id}`,
      feId: component.fe_id,
      component,
      tone: isDeleted || isChanged ? 'danger' : 'current',
      label: `当前第 ${index + 1} 项`,
      note: isDeleted ? '' : generateInsertHere ? 'AI 新增内容会从这一项后面开始插入' : undefined,
      patchId: isDeleted ? `delete:${component.fe_id}` : null,
      isSelectable: true,
      isAiSuggestion: false,
      isLatestTargetCandidate: isDeleted,
      selected: selectedId === component.fe_id,
      selectedAccent: isChanged ? 'red' : 'green'
    })

    if (isChanged && draftComponent) {
      pushEntry({
        cardId: `update:${draftComponent.fe_id}`,
        feId: draftComponent.fe_id,
        component: draftComponent,
        tone: 'suggestion',
        label: `AI 建议改为第 ${(draftPosition || 0) + 1} 项`,
        note: '下方是 AI 生成的替换内容',
        patchId: `update:${draftComponent.fe_id}`,
        isSelectable: true,
        isAiSuggestion: true,
        isLatestTargetCandidate: true,
        selected: selectedId === draftComponent.fe_id,
        selectedAccent: 'green'
      })
    }

    pushAddedEntries(addedAfterCurrent, () => `将插入到当前第 ${index + 1} 项之后`)

    if (
      mode === 'generate' &&
      !generateDraftHasBaseComponents &&
      index + 1 === generateInsertIndex &&
      previewDraft.components.length > 0
    ) {
      pushAddedEntries(previewDraft.components, () =>
        anchorIndex >= 0 ? `将插入到当前第 ${anchorIndex + 1} 项之后` : '将追加到问卷末尾'
      )
    }
  })

  if (mode === 'generate' && currentComponents.length === 0) {
    pushAddedEntries(previewDraft.components, () => '应用后会直接创建到当前问卷中')
  }

  return entries
}

export const buildReadonlyPreviewEntries = ({
  questionnaire,
  selectedId,
  note,
  cardIdPrefix
}: BuildReadonlyPreviewEntriesParams) =>
  (questionnaire.components || []).map((component, index) =>
    createCardEntry(index, {
      cardId: `${cardIdPrefix}:${component.fe_id}`,
      feId: component.fe_id,
      component,
      tone: 'current',
      label: `当前第 ${index + 1} 项`,
      note,
      patchId: null,
      isSelectable: true,
      isAiSuggestion: false,
      isLatestTargetCandidate: false,
      selected: selectedId === component.fe_id,
      patchStatusMap: {}
    })
  )

export const resolveLatestPreviewTarget = (
  entries: AiPreviewCardEntry[]
): AiPreviewLatestTarget | null => {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (!entry.isLatestTargetCandidate) continue

    return {
      cardId: entry.cardId,
      signature: buildCardSignature(entry)
    }
  }

  return null
}
