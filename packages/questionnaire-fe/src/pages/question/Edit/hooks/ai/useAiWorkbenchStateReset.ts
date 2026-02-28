import { useCallback } from 'react'
import {
  AiChatMessage,
  AiCopilotIntent,
  AiStreamStatus,
  DraftSummary,
  QuestionnaireDraft,
  QuestionnairePatchSet
} from '../../components/aiCopilotTypes'

type UseAiWorkbenchStateResetParams = {
  modeRef: { current: AiCopilotIntent }
  finalDraftRef: { current: QuestionnaireDraft | null }
  draftAppliedRef: { current: boolean }
  baseQuestionnaireRef: { current: QuestionnaireDraft | null }
  generateDraftBaseRef: { current: QuestionnaireDraft | null }
  rawReplyTextRef: { current: string }
  dispatchGenerateFlow: (action: any) => void
  resetBufferedUiUpdates: () => void
  resetLocalConnectionState: () => void
  setModeState: React.Dispatch<React.SetStateAction<AiCopilotIntent>>
  setStatus: React.Dispatch<React.SetStateAction<AiStreamStatus>>
  setMessages: React.Dispatch<React.SetStateAction<AiChatMessage[]>>
  setComposerInputState: React.Dispatch<React.SetStateAction<string>>
  setDraftPartial: React.Dispatch<React.SetStateAction<QuestionnaireDraft | null>>
  setFinalDraft: React.Dispatch<React.SetStateAction<QuestionnaireDraft | null>>
  setSummary: React.Dispatch<React.SetStateAction<DraftSummary | null>>
  setRequestId: React.Dispatch<React.SetStateAction<string | null>>
  setErrorMessage: React.Dispatch<React.SetStateAction<string | null>>
  setWarningMessage: React.Dispatch<React.SetStateAction<string | null>>
  setDraftApplied: React.Dispatch<React.SetStateAction<boolean>>
  setQuestionPatchSet: React.Dispatch<React.SetStateAction<QuestionnairePatchSet | null>>
  setSelectedPatchIds: React.Dispatch<React.SetStateAction<string[]>>
  setRejectedPatchIds: React.Dispatch<React.SetStateAction<string[]>>
}

export const useAiWorkbenchStateReset = ({
  modeRef,
  finalDraftRef,
  draftAppliedRef,
  baseQuestionnaireRef,
  generateDraftBaseRef,
  rawReplyTextRef,
  dispatchGenerateFlow,
  resetBufferedUiUpdates,
  resetLocalConnectionState,
  setModeState,
  setStatus,
  setMessages,
  setComposerInputState,
  setDraftPartial,
  setFinalDraft,
  setSummary,
  setRequestId,
  setErrorMessage,
  setWarningMessage,
  setDraftApplied,
  setQuestionPatchSet,
  setSelectedPatchIds,
  setRejectedPatchIds
}: UseAiWorkbenchStateResetParams) => {
  const clearSharedDraftState = useCallback(
    ({
      nextStatus,
      nextMode,
      clearMessages,
      clearComposerInput,
      resetGenerateFlow,
      resetDraftAppliedState
    }: {
      nextStatus?: AiStreamStatus
      nextMode?: AiCopilotIntent
      clearMessages?: boolean
      clearComposerInput?: boolean
      resetGenerateFlow?: boolean
      resetDraftAppliedState?: boolean
    }) => {
      resetBufferedUiUpdates()
      resetLocalConnectionState()

      if (nextMode) {
        modeRef.current = nextMode
        setModeState(nextMode)
      }

      finalDraftRef.current = null
      draftAppliedRef.current = false
      baseQuestionnaireRef.current = null
      generateDraftBaseRef.current = null

      if (clearMessages) {
        setMessages([])
      }
      if (clearComposerInput) {
        setComposerInputState('')
      }

      setDraftPartial(null)
      setFinalDraft(null)
      setSummary(null)
      setQuestionPatchSet(null)
      setSelectedPatchIds([])
      setRejectedPatchIds([])
      setErrorMessage(null)
      setRequestId(null)
      setWarningMessage(null)

      if (resetDraftAppliedState) {
        setDraftApplied(false)
      }
      if (nextStatus) {
        setStatus(nextStatus)
      }
      if (resetGenerateFlow) {
        dispatchGenerateFlow({ type: 'reset' })
      }

      rawReplyTextRef.current = ''
    },
    [
      baseQuestionnaireRef,
      dispatchGenerateFlow,
      draftAppliedRef,
      finalDraftRef,
      generateDraftBaseRef,
      modeRef,
      rawReplyTextRef,
      resetBufferedUiUpdates,
      resetLocalConnectionState,
      setComposerInputState,
      setDraftApplied,
      setDraftPartial,
      setErrorMessage,
      setFinalDraft,
      setMessages,
      setModeState,
      setQuestionPatchSet,
      setRejectedPatchIds,
      setRequestId,
      setSelectedPatchIds,
      setStatus,
      setSummary,
      setWarningMessage
    ]
  )

  const clearDraftAfterApply = useCallback(() => {
    clearSharedDraftState({
      nextStatus: 'done'
    })
  }, [clearSharedDraftState])

  const clearPendingDraftState = useCallback(() => {
    clearSharedDraftState({
      resetDraftAppliedState: true
    })
  }, [clearSharedDraftState])

  const resetConversationRuntimeState = useCallback(
    (nextMode: AiCopilotIntent) => {
      clearSharedDraftState({
        nextMode,
        nextStatus: 'idle',
        clearMessages: true,
        clearComposerInput: true,
        resetDraftAppliedState: true,
        resetGenerateFlow: true
      })
    },
    [clearSharedDraftState]
  )

  return {
    clearDraftAfterApply,
    clearPendingDraftState,
    resetConversationRuntimeState
  }
}
