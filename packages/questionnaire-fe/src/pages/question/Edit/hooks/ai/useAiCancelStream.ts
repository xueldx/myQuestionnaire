import { useCallback } from 'react'
import apis from '@/apis'
import { AiCopilotIntent, DraftSummary, QuestionnaireDraft } from '../../components/aiCopilotTypes'
import { BufferedUiUpdates } from './aiShared'

type UseAiCancelStreamParams = {
  mode: AiCopilotIntent
  status: string
  composerInput: string
  requestId: string | null
  draftPartial: QuestionnaireDraft | null
  finalDraft: QuestionnaireDraft | null
  summary: DraftSummary | null
  activeConversationIdRef: { current: number | null }
  controllerRef: { current: AbortController | null }
  bufferedUiUpdatesRef: { current: BufferedUiUpdates }
  finalDraftRef: { current: QuestionnaireDraft | null }
  baseQuestionnaireRef: { current: QuestionnaireDraft | null }
  dispatchGenerateFlow: (action: any) => void
  setComposerInputState: (value: string) => void
  setDraftPartial: (value: QuestionnaireDraft | null) => void
  setFinalDraft: (value: QuestionnaireDraft | null) => void
  persistConversationDraftState: (payload: {
    lastInstruction?: string | null
    latestDraft?: QuestionnaireDraft | null
    latestSummary?: DraftSummary | null
    latestBaseQuestionnaire?: QuestionnaireDraft | null
    lastRuntimeStatus?: string | null
    lastWorkflowStage?: 'polish' | 'generate' | 'edit' | null
  }) => Promise<void>
  refreshConversationList: (preferredConversationId?: number | null) => Promise<any[]>
  cancelLocalStream: (showMessage?: boolean) => void
}

export const useAiCancelStream = ({
  mode,
  status,
  composerInput,
  requestId,
  draftPartial,
  finalDraft,
  summary,
  activeConversationIdRef,
  controllerRef,
  bufferedUiUpdatesRef,
  finalDraftRef,
  baseQuestionnaireRef,
  dispatchGenerateFlow,
  setComposerInputState,
  setDraftPartial,
  setFinalDraft,
  persistConversationDraftState,
  refreshConversationList,
  cancelLocalStream
}: UseAiCancelStreamParams) => {
  return useCallback(
    (showMessage = true) => {
      const activeRequestId = requestId
      const activeConversationId = activeConversationIdRef.current
      const pendingBufferedUpdates = bufferedUiUpdatesRef.current
      const persistedWorkflowStage =
        mode === 'edit'
          ? 'edit'
          : status === 'polishing' || status === 'awaiting_confirmation'
          ? 'polish'
          : 'generate'
      const nextComposerInput = pendingBufferedUpdates.promptDelta
        ? pendingBufferedUpdates.replacePrompt
          ? pendingBufferedUpdates.promptDelta
          : `${composerInput}${pendingBufferedUpdates.promptDelta}`
        : pendingBufferedUpdates.preservedPrompt || composerInput
      const preservedDraft =
        finalDraft || pendingBufferedUpdates.partialDraft || draftPartial || null

      if (nextComposerInput !== composerInput) {
        setComposerInputState(nextComposerInput)
        if (mode === 'generate') {
          dispatchGenerateFlow({
            type: 'edit_refined_prompt',
            prompt: nextComposerInput
          })
        }
      }

      if (!finalDraft && pendingBufferedUpdates.partialDraft) {
        setDraftPartial(pendingBufferedUpdates.partialDraft)
        setFinalDraft(null)
        finalDraftRef.current = null
      }

      if (controllerRef.current && (activeRequestId || activeConversationId)) {
        void apis.aiApi
          .cancelCopilot({
            requestId: activeRequestId || undefined,
            conversationId: activeConversationId || undefined
          })
          .finally(() => {
            void persistConversationDraftState({
              lastInstruction: nextComposerInput.trim() || null,
              latestDraft: preservedDraft,
              latestSummary: finalDraft ? summary : null,
              latestBaseQuestionnaire: baseQuestionnaireRef.current,
              lastRuntimeStatus: 'cancelled',
              lastWorkflowStage: persistedWorkflowStage
            })
            if (activeConversationId) {
              void refreshConversationList(activeConversationId)
            }
          })
      }

      cancelLocalStream(showMessage)
    },
    [
      activeConversationIdRef,
      baseQuestionnaireRef,
      bufferedUiUpdatesRef,
      cancelLocalStream,
      composerInput,
      controllerRef,
      dispatchGenerateFlow,
      draftPartial,
      finalDraft,
      finalDraftRef,
      mode,
      persistConversationDraftState,
      refreshConversationList,
      requestId,
      setComposerInputState,
      setDraftPartial,
      setFinalDraft,
      status,
      summary
    ]
  )
}
