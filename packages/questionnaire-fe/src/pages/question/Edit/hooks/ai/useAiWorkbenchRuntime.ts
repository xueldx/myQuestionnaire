import { useCallback } from 'react'
import { normalizeQuestionnaireComponentList } from '@/utils/normalizeQuestionComponent'
import {
  AiChatMessage,
  AiCopilotIntent,
  AiGenerateFlowState,
  AiProcessScenario,
  AiStreamStatus,
  DraftSummary,
  QuestionnaireDraft
} from '../../components/aiCopilotTypes'
import { mergeGenerateDraftIntoBase } from '../aiGenerateDraftMerge'
import { buildPersistedDraft, getEmptyDraftFallback } from './aiShared'
import {
  cancelProcessMessage,
  finalizeProcessMessage,
  normalizeConversationMessages,
  updateProcessByStatus
} from './aiProcessState'

type MessageApi = {
  info: (content: string) => void
}

type UseAiWorkbenchRuntimeParams = {
  mode: AiCopilotIntent
  status: AiStreamStatus
  componentList: QuestionnaireDraft['components']
  pageConfig: Pick<QuestionnaireDraft, 'title' | 'description' | 'footerText'>
  selectedId: string
  message: MessageApi
  controllerRef: { current: AbortController | null }
  modeRef: { current: AiCopilotIntent }
  rawReplyTextRef: { current: string }
  finalDraftRef: { current: QuestionnaireDraft | null }
  draftAppliedRef: { current: boolean }
  baseQuestionnaireRef: { current: QuestionnaireDraft | null }
  generateDraftBaseRef: { current: QuestionnaireDraft | null }
  dispatchGenerateFlow: (action: any) => void
  resetBufferedUiUpdates: () => void
  setModeState: React.Dispatch<React.SetStateAction<AiCopilotIntent>>
  setMessages: React.Dispatch<React.SetStateAction<AiChatMessage[]>>
  setComposerInputState: React.Dispatch<React.SetStateAction<string>>
  setRequestId: React.Dispatch<React.SetStateAction<string | null>>
  setErrorMessage: React.Dispatch<React.SetStateAction<string | null>>
  setWarningMessage: React.Dispatch<React.SetStateAction<string | null>>
  setDraftApplied: React.Dispatch<React.SetStateAction<boolean>>
  setDraftPartial: React.Dispatch<React.SetStateAction<QuestionnaireDraft | null>>
  setFinalDraft: React.Dispatch<React.SetStateAction<QuestionnaireDraft | null>>
  setSummary: React.Dispatch<React.SetStateAction<DraftSummary | null>>
  setStatus: React.Dispatch<React.SetStateAction<AiStreamStatus>>
}

export const useAiWorkbenchRuntime = ({
  mode,
  status,
  componentList,
  pageConfig,
  selectedId,
  message,
  controllerRef,
  modeRef,
  rawReplyTextRef,
  finalDraftRef,
  draftAppliedRef,
  baseQuestionnaireRef,
  generateDraftBaseRef,
  dispatchGenerateFlow,
  resetBufferedUiUpdates,
  setModeState,
  setMessages,
  setComposerInputState,
  setRequestId,
  setErrorMessage,
  setWarningMessage,
  setDraftApplied,
  setDraftPartial,
  setFinalDraft,
  setSummary,
  setStatus
}: UseAiWorkbenchRuntimeParams) => {
  const buildDraftFallback = useCallback(
    (requestIntent: AiCopilotIntent): QuestionnaireDraft => {
      if (requestIntent === 'edit') {
        return {
          title: pageConfig.title,
          description: pageConfig.description,
          footerText: pageConfig.footerText,
          components: componentList
        }
      }

      return getEmptyDraftFallback()
    },
    [componentList, pageConfig.description, pageConfig.footerText, pageConfig.title]
  )

  const hydrateConversationDetail = useCallback(
    (detail: {
      id: number
      intent: AiCopilotIntent
      messages?: AiChatMessage[]
      lastInstruction?: string | null
      lastRuntimeStatus?: AiStreamStatus | null
      lastWorkflowStage?: 'polish' | 'generate' | 'edit' | null
      latestDraft?: QuestionnaireDraft | null
      latestSummary?: DraftSummary | null
      latestBaseQuestionnaire?: QuestionnaireDraft | null
    }) => {
      resetBufferedUiUpdates()
      modeRef.current = detail.intent
      setModeState(detail.intent)
      const processScenario =
        detail.lastWorkflowStage === 'polish'
          ? 'polish'
          : detail.lastWorkflowStage === 'edit'
          ? 'edit'
          : detail.intent
      const normalizedMessages = normalizeConversationMessages(detail.messages || [], detail.intent)
      const restoredMessages =
        detail.lastRuntimeStatus === 'cancelled'
          ? cancelProcessMessage(normalizedMessages, processScenario)
          : detail.lastRuntimeStatus === 'draft_ready' || detail.lastRuntimeStatus === 'done'
          ? finalizeProcessMessage(normalizedMessages, processScenario, detail.lastRuntimeStatus)
          : normalizedMessages

      setMessages(restoredMessages)
      setComposerInputState(detail.lastInstruction || '')
      setRequestId(null)
      setErrorMessage(null)
      setWarningMessage(null)
      setDraftApplied(false)
      rawReplyTextRef.current = ''
      baseQuestionnaireRef.current = detail.latestBaseQuestionnaire || null

      const restoredDraft = buildPersistedDraft(
        detail.latestDraft || null,
        buildDraftFallback(detail.intent),
        `conversation-${detail.id}-latest`
      )

      setDraftPartial(restoredDraft)
      const shouldRestoreAsFinalDraft =
        detail.lastRuntimeStatus === 'draft_ready' ||
        detail.lastRuntimeStatus === 'done' ||
        (!detail.lastRuntimeStatus && Boolean(detail.latestDraft && detail.latestSummary))
      setFinalDraft(shouldRestoreAsFinalDraft ? restoredDraft : null)
      finalDraftRef.current = shouldRestoreAsFinalDraft ? restoredDraft : null
      draftAppliedRef.current = false
      setSummary(detail.latestSummary || null)
      setStatus(
        detail.lastRuntimeStatus ||
          (detail.latestDraft && !detail.latestSummary
            ? 'cancelled'
            : restoredDraft
            ? 'draft_ready'
            : detail.messages?.length
            ? 'done'
            : 'idle')
      )

      dispatchGenerateFlow({ type: 'reset' })
      if (detail.intent === 'generate' && detail.lastInstruction) {
        dispatchGenerateFlow({
          type: 'edit_refined_prompt',
          prompt: detail.lastInstruction
        })
      }
    },
    [
      buildDraftFallback,
      dispatchGenerateFlow,
      draftAppliedRef,
      finalDraftRef,
      baseQuestionnaireRef,
      modeRef,
      rawReplyTextRef,
      resetBufferedUiUpdates,
      setComposerInputState,
      setDraftApplied,
      setDraftPartial,
      setErrorMessage,
      setFinalDraft,
      setMessages,
      setModeState,
      setRequestId,
      setStatus,
      setSummary,
      setWarningMessage
    ]
  )

  const syncRuntimeStatus = useCallback(
    (
      nextStatus: Extract<
        AiStreamStatus,
        'connecting' | 'polishing' | 'thinking' | 'answering' | 'drafting'
      >,
      requestIntent: AiCopilotIntent,
      processScenario: AiProcessScenario,
      _fallbackMessage: string
    ) => {
      setStatus(nextStatus)

      if (requestIntent === 'generate') {
        dispatchGenerateFlow({
          type: 'sync_runtime_phase',
          phase: nextStatus
        })
      }

      setMessages(previousMessages =>
        updateProcessByStatus(previousMessages, processScenario, nextStatus)
      )
    },
    [dispatchGenerateFlow, setMessages, setStatus]
  )

  const buildQuestionnaireSnapshot = useCallback(() => {
    const pendingDraft =
      finalDraftRef.current && !draftAppliedRef.current ? finalDraftRef.current : null

    if (pendingDraft) {
      return {
        title: pendingDraft.title,
        description: pendingDraft.description,
        footerText: pendingDraft.footerText,
        components: normalizeQuestionnaireComponentList(pendingDraft.components)
      }
    }

    return {
      title: pageConfig.title,
      description: pageConfig.description,
      footerText: pageConfig.footerText,
      components: normalizeQuestionnaireComponentList(componentList)
    }
  }, [componentList, draftAppliedRef, finalDraftRef, pageConfig])

  const buildCommittedQuestionnaireSnapshot = useCallback(
    () => ({
      title: pageConfig.title,
      description: pageConfig.description,
      footerText: pageConfig.footerText,
      components: normalizeQuestionnaireComponentList(componentList)
    }),
    [componentList, pageConfig]
  )

  const buildMergedGenerateDraft = useCallback(
    (incomingDraft: QuestionnaireDraft) => {
      const baseDraft = generateDraftBaseRef.current
      if (!baseDraft || baseDraft.components.length === 0) {
        return incomingDraft
      }

      return mergeGenerateDraftIntoBase({
        baseDraft,
        additionDraft: incomingDraft,
        selectedId,
        currentComponents: componentList
      })
    },
    [componentList, generateDraftBaseRef, selectedId]
  )

  const cancelStream = useCallback(
    (showMessage = true) => {
      if (!controllerRef.current) return
      controllerRef.current.abort()
      controllerRef.current = null
      resetBufferedUiUpdates()

      const processScenario =
        mode === 'edit'
          ? 'edit'
          : status === 'polishing' || status === 'awaiting_confirmation'
          ? 'polish'
          : 'generate'

      if (mode === 'generate') {
        dispatchGenerateFlow({ type: 'cancel' })
      }

      setRequestId(null)
      setMessages(previousMessages => cancelProcessMessage(previousMessages, processScenario))
      setStatus('cancelled')
      if (showMessage) {
        message.info('已停止当前 AI 会话')
      }
    },
    [
      controllerRef,
      dispatchGenerateFlow,
      message,
      mode,
      resetBufferedUiUpdates,
      setMessages,
      setRequestId,
      setStatus,
      status
    ]
  )

  return {
    buildDraftFallback,
    hydrateConversationDetail,
    syncRuntimeStatus,
    buildQuestionnaireSnapshot,
    buildCommittedQuestionnaireSnapshot,
    buildMergedGenerateDraft,
    cancelStream
  }
}
