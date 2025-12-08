import { useCallback } from 'react'
import apis from '@/apis'
import { AiCopilotIntent, AiStreamStatus } from '../../components/aiCopilotTypes'

const ACTIVE_STREAM_STATUSES: AiStreamStatus[] = [
  'connecting',
  'polishing',
  'thinking',
  'answering',
  'drafting'
]

type UseAiWorkbenchSessionParams = {
  mode: AiCopilotIntent
  status: AiStreamStatus
  composerInput: string
  messagesLength: number
  hasQuestionnaireContent: boolean
  controllerRef: { current: AbortController | null }
  activeConversationIdRef: { current: number | null }
  modeRef: { current: AiCopilotIntent }
  finalDraftRef: { current: any }
  draftAppliedRef: { current: boolean }
  message: {
    warning: (content: string) => void
  }
  createConversation: (intent?: AiCopilotIntent, title?: string) => Promise<any>
  refreshConversationList: (
    preferredConversationId?: number | null,
    options?: { hydrateDetail?: boolean }
  ) => Promise<any[]>
  setActiveConversationId: (value: number | null) => void
  resetConversationRuntimeState: (nextMode: AiCopilotIntent) => void
  resetBufferedUiUpdates: () => void
  persistConversationDraftState: (payload: {
    lastInstruction?: string | null
    latestDraft?: unknown | null
    latestSummary?: unknown | null
    latestBaseQuestionnaire?: unknown | null
    latestBatches?: unknown[] | null
    lastRuntimeStatus?: AiStreamStatus | null
    lastWorkflowStage?: 'polish' | 'generate' | 'edit' | null
  }) => Promise<void>
  clearPendingDraftState: () => void
  dispatchGenerateFlow: (action: any) => void
  setModeState: (value: AiCopilotIntent) => void
  setStatus: (value: AiStreamStatus) => void
  setRequestId: (value: string | null) => void
  setErrorMessage: (value: string | null) => void
  setWarningMessage: (value: string | null) => void
  setQuestionPatchSet: (value: any) => void
  setSelectedPatchIds: (value: string[]) => void
  setRejectedPatchIds: (value: string[]) => void
  setDraftPartial: (value: any) => void
  setFinalDraft: (value: any) => void
  setSummary: (value: any) => void
  setDraftApplied: (value: boolean) => void
  setComposerInputState: (value: string) => void
  rawReplyTextRef: { current: string }
}

export const useAiWorkbenchSession = ({
  mode,
  status,
  composerInput,
  messagesLength,
  hasQuestionnaireContent,
  controllerRef,
  activeConversationIdRef,
  modeRef,
  finalDraftRef,
  draftAppliedRef,
  message,
  createConversation,
  refreshConversationList,
  setActiveConversationId,
  resetConversationRuntimeState,
  resetBufferedUiUpdates,
  persistConversationDraftState,
  clearPendingDraftState,
  dispatchGenerateFlow,
  setModeState,
  setStatus,
  setRequestId,
  setErrorMessage,
  setWarningMessage,
  setQuestionPatchSet,
  setSelectedPatchIds,
  setRejectedPatchIds,
  setDraftPartial,
  setFinalDraft,
  setSummary,
  setDraftApplied,
  setComposerInputState,
  rawReplyTextRef
}: UseAiWorkbenchSessionParams) => {
  const resetConversationDraftView = useCallback(
    (nextMode: AiCopilotIntent) => {
      activeConversationIdRef.current = null
      setActiveConversationId(null)
      resetConversationRuntimeState(nextMode)
    },
    [activeConversationIdRef, resetConversationRuntimeState, setActiveConversationId]
  )

  const setMode = useCallback(
    (nextMode: AiCopilotIntent) => {
      if (nextMode === mode) return
      if (controllerRef.current) {
        message.warning('请先停止当前 AI 会话，再切换模式')
        return
      }

      setModeState(nextMode)
      setStatus('idle')
      setRequestId(null)
      setErrorMessage(null)
      setWarningMessage(null)
      rawReplyTextRef.current = ''
      resetBufferedUiUpdates()
      dispatchGenerateFlow({ type: 'reset' })
      setQuestionPatchSet(null)
      setSelectedPatchIds([])
      setRejectedPatchIds([])
      setDraftPartial(null)
      setFinalDraft(null)
      setSummary(null)
      setDraftApplied(false)

      if (activeConversationIdRef.current) {
        void apis.aiApi
          .updateConversation(activeConversationIdRef.current, {
            intent: nextMode
          })
          .then(() => refreshConversationList(activeConversationIdRef.current))
      }
    },
    [
      activeConversationIdRef,
      controllerRef,
      dispatchGenerateFlow,
      draftAppliedRef,
      finalDraftRef,
      message,
      mode,
      rawReplyTextRef,
      refreshConversationList,
      resetBufferedUiUpdates,
      setDraftApplied,
      setDraftPartial,
      setErrorMessage,
      setFinalDraft,
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

  const ensureActiveConversation = useCallback(
    async (nextIntent: AiCopilotIntent) => {
      if (activeConversationIdRef.current) return true

      const existingList = await refreshConversationList(undefined, {
        hydrateDetail: true
      })
      if (activeConversationIdRef.current) return true
      if (existingList.length > 0) return Boolean(activeConversationIdRef.current)

      const createdConversation = await createConversation(nextIntent)
      return Boolean(createdConversation)
    },
    [activeConversationIdRef, createConversation, refreshConversationList]
  )

  const ensureEntryConversation = useCallback(
    async (nextIntent: AiCopilotIntent) => {
      if (controllerRef.current) return
      if (activeConversationIdRef.current) return

      const existingList = await refreshConversationList(undefined, {
        hydrateDetail: true
      })

      if (existingList.length > 0 || activeConversationIdRef.current) {
        return
      }

      resetConversationDraftView(nextIntent)
    },
    [activeConversationIdRef, controllerRef, refreshConversationList, resetConversationDraftView]
  )

  const openFreshEditEntrySession = useCallback(async () => {
    if (!hasQuestionnaireContent) return
    await ensureEntryConversation('edit')
  }, [ensureEntryConversation, hasQuestionnaireContent])

  const openFreshGenerateEntrySession = useCallback(async () => {
    if (hasQuestionnaireContent) return
    await ensureEntryConversation('generate')
  }, [ensureEntryConversation, hasQuestionnaireContent])

  const setComposerInput = useCallback(
    (nextValue: string) => {
      setComposerInputState(nextValue)
      if (!nextValue.trim() && draftAppliedRef.current && !finalDraftRef.current) {
        setDraftApplied(false)
      }
      if (mode === 'generate') {
        dispatchGenerateFlow({
          type: 'edit_refined_prompt',
          prompt: nextValue
        })
      }
    },
    [
      dispatchGenerateFlow,
      draftAppliedRef,
      finalDraftRef,
      mode,
      setComposerInputState,
      setDraftApplied
    ]
  )

  const discardDraft = useCallback(() => {
    clearPendingDraftState()

    const nextPrompt = composerInput.trim()
    void persistConversationDraftState({
      lastInstruction: nextPrompt || null,
      latestDraft: null,
      latestSummary: null,
      latestBaseQuestionnaire: null,
      latestBatches: null,
      lastRuntimeStatus:
        mode === 'generate' && nextPrompt
          ? 'awaiting_confirmation'
          : messagesLength > 0
          ? 'done'
          : 'idle',
      lastWorkflowStage: mode === 'generate' && nextPrompt ? 'polish' : mode
    })

    if (mode === 'generate' && nextPrompt) {
      dispatchGenerateFlow({
        type: 'edit_refined_prompt',
        prompt: nextPrompt
      })
      setStatus('awaiting_confirmation')
      return
    }

    dispatchGenerateFlow({ type: 'reset' })
    if (!ACTIVE_STREAM_STATUSES.includes(status)) {
      setStatus(messagesLength > 0 ? 'done' : 'idle')
    }
  }, [
    clearPendingDraftState,
    composerInput,
    dispatchGenerateFlow,
    messagesLength,
    mode,
    persistConversationDraftState,
    setStatus,
    status
  ])

  return {
    setMode,
    ensureActiveConversation,
    openFreshEditEntrySession,
    openFreshGenerateEntrySession,
    setComposerInput,
    discardDraft
  }
}
