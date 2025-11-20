import { App } from 'antd'
import { startTransition, useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import apis from '@/apis'
import { RootState } from '@/store'
import { AppDispatch } from '@/store'
import {
  AiConversationDetail,
  AiChatMessage,
  AiCopilotIntent,
  AiGenerateFlowState,
  AiModelOption,
  AiStreamStatus,
  DraftSummary,
  QuestionnaireDraft
} from '@/pages/question/Edit/components/aiCopilotTypes'
import {
  aiGenerateFlowReducer,
  initialAiGenerateFlowState
} from '@/pages/question/Edit/hooks/aiGenerateFlowMachine'
import { getComposerGuide } from '@/pages/question/Edit/hooks/aiDraftInteraction'
import { BufferedUiUpdates, DraftApplyPayload } from '@/pages/question/Edit/hooks/ai/aiShared'
import { useAiDraftApply } from '@/pages/question/Edit/hooks/ai/useAiDraftApply'
import { useAiConversationList } from '@/pages/question/Edit/hooks/ai/useAiConversationList'
import { useAiDraftStream } from '@/pages/question/Edit/hooks/ai/useAiDraftStream'
import { useAiPromptPolishStream } from '@/pages/question/Edit/hooks/ai/useAiPromptPolishStream'
import { useAiInstructionActions } from '@/pages/question/Edit/hooks/ai/useAiInstructionActions'
import { useAiWorkbenchRuntime } from '@/pages/question/Edit/hooks/ai/useAiWorkbenchRuntime'

const useAiWorkbench = (
  questionnaireId: string,
  options?: {
    onDraftApplied?: (payload: DraftApplyPayload) => Promise<void> | void
  }
) => {
  const { message, modal } = App.useApp()
  const onDraftApplied = options?.onDraftApplied
  const dispatch = useDispatch<AppDispatch>()
  const componentList = useSelector((state: RootState) => state.components.componentList)
  const selectedId = useSelector((state: RootState) => state.components.selectedId)
  const version = useSelector((state: RootState) => state.components.version)
  const pageConfig = useSelector((state: RootState) => state.pageConfig)

  const [mode, setModeState] = useState<AiCopilotIntent>('generate')
  const [status, setStatus] = useState<AiStreamStatus>('idle')
  const [messages, setMessages] = useState<AiChatMessage[]>([])
  const [modelList, setModelList] = useState<AiModelOption[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [composerInput, setComposerInputState] = useState('')
  const [isPendingDraftDecisionOpen, setIsPendingDraftDecisionOpen] = useState(false)
  const [draftPartial, setDraftPartial] = useState<QuestionnaireDraft | null>(null)
  const [finalDraft, setFinalDraft] = useState<QuestionnaireDraft | null>(null)
  const [summary, setSummary] = useState<DraftSummary | null>(null)
  const [requestId, setRequestId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [warningMessage, setWarningMessage] = useState<string | null>(null)
  const [draftApplied, setDraftApplied] = useState(false)
  const [generateFlow, dispatchGenerateFlow] = useReducer(
    aiGenerateFlowReducer,
    initialAiGenerateFlowState
  )
  const hasQuestionnaireContent = componentList.length > 0
  const hasPendingDraft = Boolean(finalDraft && !draftApplied)
  const composerGuide = getComposerGuide({
    mode,
    hasPendingDraft,
    hasQuestionnaireContent
  })

  const controllerRef = useRef<AbortController | null>(null)
  const baseVersionRef = useRef(version)
  const modeRef = useRef<AiCopilotIntent>(mode)
  const rawReplyTextRef = useRef('')
  const finalDraftRef = useRef<QuestionnaireDraft | null>(null)
  const draftAppliedRef = useRef(false)
  const pendingDraftInstructionRef = useRef('')
  const generateFlowRef = useRef<AiGenerateFlowState>(generateFlow)
  const rafFlushIdRef = useRef<number | null>(null)
  const generateDraftBaseRef = useRef<QuestionnaireDraft | null>(null)
  const bufferedUiUpdatesRef = useRef<BufferedUiUpdates>({
    promptDelta: '',
    replacePrompt: false,
    partialDraft: null
  })

  useEffect(() => {
    finalDraftRef.current = finalDraft
  }, [finalDraft])

  useEffect(() => {
    draftAppliedRef.current = draftApplied
  }, [draftApplied])

  useEffect(() => {
    generateFlowRef.current = generateFlow
  }, [generateFlow])

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  const flushBufferedUiUpdates = useCallback((immediate = false) => {
    if (rafFlushIdRef.current !== null) {
      window.cancelAnimationFrame(rafFlushIdRef.current)
      rafFlushIdRef.current = null
    }

    const updates = bufferedUiUpdatesRef.current
    if (!updates.promptDelta && !updates.partialDraft) return

    bufferedUiUpdatesRef.current = {
      promptDelta: '',
      replacePrompt: false,
      partialDraft: null
    }

    const applyUpdates = () => {
      if (updates.promptDelta) {
        setComposerInputState(previousValue =>
          updates.replacePrompt ? updates.promptDelta : `${previousValue}${updates.promptDelta}`
        )
        dispatchGenerateFlow({
          type: 'append_refined_delta',
          delta: updates.promptDelta
        })
      }

      if (updates.partialDraft) {
        setDraftPartial(updates.partialDraft)
        setDraftApplied(false)
      }
    }

    if (immediate) {
      applyUpdates()
      return
    }

    startTransition(() => {
      applyUpdates()
    })
  }, [])

  const scheduleBufferedUiFlush = useCallback(() => {
    if (rafFlushIdRef.current !== null) return

    rafFlushIdRef.current = window.requestAnimationFrame(() => {
      rafFlushIdRef.current = null
      flushBufferedUiUpdates()
    })
  }, [flushBufferedUiUpdates])

  const resetBufferedUiUpdates = useCallback(() => {
    if (rafFlushIdRef.current !== null) {
      window.cancelAnimationFrame(rafFlushIdRef.current)
      rafFlushIdRef.current = null
    }

    bufferedUiUpdatesRef.current = {
      promptDelta: '',
      replacePrompt: false,
      partialDraft: null
    }
  }, [])

  useEffect(() => {
    return () => {
      resetBufferedUiUpdates()
    }
  }, [resetBufferedUiUpdates])

  const clearDraftAfterApply = useCallback(() => {
    resetBufferedUiUpdates()
    setDraftPartial(null)
    setFinalDraft(null)
    setSummary(null)
    setErrorMessage(null)
    setRequestId(null)
    setWarningMessage(null)
    setStatus('done')
    rawReplyTextRef.current = ''
  }, [resetBufferedUiUpdates])

  const clearPendingDraftState = useCallback(() => {
    resetBufferedUiUpdates()
    finalDraftRef.current = null
    draftAppliedRef.current = false
    generateDraftBaseRef.current = null
    setDraftPartial(null)
    setFinalDraft(null)
    setSummary(null)
    setErrorMessage(null)
    setWarningMessage(null)
    setRequestId(null)
    setDraftApplied(false)
    rawReplyTextRef.current = ''
  }, [resetBufferedUiUpdates])

  useEffect(() => {
    apis.aiApi.getModelList().then((response: any) => {
      if (response.code === 1 && Array.isArray(response.data)) {
        setModelList(response.data)
        if (!selectedModel && response.data.length > 0) {
          setSelectedModel(response.data[0].value)
        }
      }
    })
  }, [])

  const {
    buildDraftFallback,
    hydrateConversationDetail,
    syncRuntimeStatus,
    buildQuestionnaireSnapshot,
    buildMergedGenerateDraft,
    cancelStream
  } = useAiWorkbenchRuntime({
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
  })

  const resetConversationRuntimeState = useCallback(
    (nextMode: AiCopilotIntent) => {
      resetBufferedUiUpdates()
      modeRef.current = nextMode
      finalDraftRef.current = null
      draftAppliedRef.current = false
      setModeState(nextMode)
      setStatus('idle')
      setMessages([])
      setComposerInputState('')
      setDraftPartial(null)
      setFinalDraft(null)
      setSummary(null)
      setRequestId(null)
      setErrorMessage(null)
      setWarningMessage(null)
      setDraftApplied(false)
      rawReplyTextRef.current = ''
      dispatchGenerateFlow({ type: 'reset' })
    },
    [resetBufferedUiUpdates]
  )

  const handleHydrateConversationDetail = useCallback(
    (detail: AiConversationDetail) => {
      hydrateConversationDetail(detail)
    },
    [hydrateConversationDetail]
  )

  const handleResetConversationState = useCallback(() => {
    resetConversationRuntimeState(modeRef.current)
  }, [resetConversationRuntimeState])

  const {
    conversationList,
    activeConversationId,
    conversationLoading,
    conversationListLoading,
    activeConversationIdRef,
    setActiveConversationId,
    refreshConversationList,
    createConversation,
    openNewConversation,
    selectConversation,
    renameConversation,
    toggleConversationPin,
    removeConversation,
    persistConversationDraftState
  } = useAiConversationList({
    questionnaireId,
    message,
    modal,
    controllerRef,
    modeRef,
    finalDraftRef,
    draftAppliedRef,
    hydrateConversationDetail: handleHydrateConversationDetail,
    resetConversationState: handleResetConversationState
  })

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
        message.warning('请先停止当前 AI 会话，再切换生成模式')
        return
      }

      const hasPendingDraft = finalDraftRef.current && !draftAppliedRef.current
      const hasAppliedPreview = draftAppliedRef.current && !finalDraftRef.current

      setModeState(nextMode)
      setStatus(hasPendingDraft || hasAppliedPreview ? 'done' : 'idle')
      setRequestId(null)
      setErrorMessage(null)
      setWarningMessage(null)
      rawReplyTextRef.current = ''
      resetBufferedUiUpdates()
      dispatchGenerateFlow({ type: 'reset' })

      if (!hasPendingDraft) {
        setDraftPartial(null)
        setFinalDraft(null)
        setSummary(null)
        if (!hasAppliedPreview) {
          setDraftApplied(false)
        }
      }

      if (activeConversationIdRef.current) {
        void apis.aiApi
          .updateConversation(activeConversationIdRef.current, {
            intent: nextMode
          })
          .then(() => refreshConversationList(activeConversationIdRef.current))
      }
    },
    [message, mode, refreshConversationList, resetBufferedUiUpdates]
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
    [createConversation, refreshConversationList]
  )

  const ensureEntryConversation = useCallback(
    async (nextIntent: AiCopilotIntent) => {
      if (controllerRef.current) return
      if (finalDraftRef.current && !draftAppliedRef.current) return
      if (activeConversationIdRef.current) return

      const existingList = await refreshConversationList(undefined, {
        hydrateDetail: true
      })

      if (existingList.length > 0 || activeConversationIdRef.current) {
        return
      }

      resetConversationDraftView(nextIntent)
    },
    [refreshConversationList, resetConversationDraftView]
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
    [mode]
  )

  const discardDraft = useCallback(() => {
    clearPendingDraftState()

    const nextPrompt = composerInput.trim()
    void persistConversationDraftState({
      lastInstruction: nextPrompt || null,
      latestDraft: null,
      latestSummary: null
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
      setStatus(messages.length > 0 ? 'done' : 'idle')
    }
  }, [
    clearPendingDraftState,
    composerInput,
    messages.length,
    mode,
    persistConversationDraftState,
    status
  ])

  const { applyDraft } = useAiDraftApply({
    mode,
    version,
    selectedId,
    componentList,
    pageConfig,
    finalDraft,
    draftApplied,
    baseVersionRef,
    dispatch,
    message,
    modal,
    clearDraftAfterApply,
    persistConversationDraftState,
    onDraftApplied,
    setDraftApplied
  })

  const runDraftStream = useAiDraftStream({
    questionnaireId,
    selectedModel,
    version,
    messages,
    message,
    controllerRef,
    activeConversationIdRef,
    baseVersionRef,
    finalDraftRef,
    draftAppliedRef,
    rawReplyTextRef,
    generateDraftBaseRef,
    bufferedUiUpdatesRef,
    setActiveConversationId,
    setStatus,
    setMessages,
    setErrorMessage,
    setDraftPartial,
    setFinalDraft,
    setSummary,
    setRequestId,
    setWarningMessage,
    setDraftApplied,
    dispatchGenerateFlow,
    ensureActiveConversation,
    buildQuestionnaireSnapshot,
    buildDraftFallback,
    buildMergedGenerateDraft,
    refreshConversationList,
    scheduleBufferedUiFlush,
    flushBufferedUiUpdates,
    resetBufferedUiUpdates,
    syncRuntimeStatus
  })

  const runPromptPolishStream = useAiPromptPolishStream({
    questionnaireId,
    selectedModel,
    version,
    messages,
    message,
    controllerRef,
    activeConversationIdRef,
    baseVersionRef,
    rawReplyTextRef,
    generateFlowRef,
    bufferedUiUpdatesRef,
    setActiveConversationId,
    setStatus,
    setMessages,
    setErrorMessage,
    setWarningMessage,
    setRequestId,
    setDraftApplied,
    setComposerInputState,
    dispatchGenerateFlow,
    ensureActiveConversation: async () => ensureActiveConversation('generate'),
    buildQuestionnaireSnapshot,
    refreshConversationList,
    scheduleBufferedUiFlush,
    flushBufferedUiUpdates,
    resetBufferedUiUpdates,
    syncRuntimeStatus
  })

  const closePendingDraftDecision = useCallback(() => {
    pendingDraftInstructionRef.current = ''
    setIsPendingDraftDecisionOpen(false)
  }, [])

  const {
    appendPendingDraft,
    regeneratePendingDraft,
    sendInstruction,
    polishInstruction,
    retryPromptPolish,
    retryGenerate
  } = useAiInstructionActions({
    mode,
    composerInput,
    message,
    finalDraftRef,
    draftAppliedRef,
    generateFlowRef,
    pendingDraftInstructionRef,
    setModeState,
    setComposerInputState,
    setIsPendingDraftDecisionOpen,
    dispatchGenerateFlow,
    clearPendingDraftState,
    closePendingDraftDecision,
    persistConversationDraftState,
    ensureActiveConversation,
    runDraftStream,
    runPromptPolishStream
  })

  return {
    mode,
    status,
    messages,
    conversationList,
    activeConversationId,
    conversationLoading,
    conversationListLoading,
    modelList,
    selectedModel,
    composerInput,
    draftPartial,
    finalDraft,
    summary,
    requestId,
    errorMessage,
    warningMessage,
    draftApplied,
    hasPendingDraft,
    composerGuide,
    generateFlow,
    setMode,
    setSelectedModel,
    setComposerInput,
    openFreshEditEntrySession,
    openFreshGenerateEntrySession,
    openNewConversation,
    selectConversation,
    renameConversation,
    toggleConversationPin,
    removeConversation,
    sendInstruction,
    polishInstruction,
    cancelStream,
    discardDraft,
    applyDraft,
    retryPromptPolish,
    retryGenerate,
    isPendingDraftDecisionOpen,
    closePendingDraftDecision,
    appendPendingDraft,
    regeneratePendingDraft
  }
}

export default useAiWorkbench
