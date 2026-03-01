import { App } from 'antd'
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState
} from 'react'
import { useDispatch, useSelector } from 'react-redux'
import apis from '@/apis'
import { RootState } from '@/store'
import { AppDispatch } from '@/store'
import { resetPageConfig } from '@/store/modules/pageConfigSlice'
import {
  AiConversationDetail,
  AiChatMessage,
  AiCopilotIntent,
  AiGenerateFlowState,
  AiLocalConnectionState,
  AiLocalInterruptedStreamKind,
  AiModelOption,
  AiStreamStatus,
  DraftSummary,
  QuestionnaireDraft,
  QuestionnairePatchSet
} from '@/pages/question/Edit/components/aiCopilotTypes'
import {
  aiGenerateFlowReducer,
  initialAiGenerateFlowState
} from '@/pages/question/Edit/hooks/aiGenerateFlowMachine'
import { BufferedUiUpdates, DraftApplyPayload } from '@/pages/question/Edit/hooks/ai/aiShared'
import { getPatchStatus, getReviewablePatches } from '@/pages/question/Edit/hooks/aiQuestionPatch'
import { useAiDraftApply } from '@/pages/question/Edit/hooks/ai/useAiDraftApply'
import { useAiCancelStream } from '@/pages/question/Edit/hooks/ai/useAiCancelStream'
import { useAiConversationList } from '@/pages/question/Edit/hooks/ai/useAiConversationList'
import { useAiDraftStream } from '@/pages/question/Edit/hooks/ai/useAiDraftStream'
import { useAiInterruptedRunRecovery } from '@/pages/question/Edit/hooks/ai/useAiInterruptedRunRecovery'
import { useAiPromptPolishStream } from '@/pages/question/Edit/hooks/ai/useAiPromptPolishStream'
import {
  AiWorkbenchSelectedModelSource,
  resolveHydratedConversationDetail,
  resolvePreferredAiModel,
  useAiWorkbenchPersistence
} from '@/pages/question/Edit/hooks/ai/useAiWorkbenchPersistence'
import { useAiWorkbenchLeaveGuard } from '@/pages/question/Edit/hooks/ai/useAiWorkbenchLeaveGuard'
import { useAiWorkbenchStateReset } from '@/pages/question/Edit/hooks/ai/useAiWorkbenchStateReset'
import { useAiInstructionActions } from '@/pages/question/Edit/hooks/ai/useAiInstructionActions'
import { useAiPatchReview } from '@/pages/question/Edit/hooks/ai/useAiPatchReview'
import { useAiWorkbenchSession } from '@/pages/question/Edit/hooks/ai/useAiWorkbenchSession'
import { useAiWorkbenchRuntime } from '@/pages/question/Edit/hooks/ai/useAiWorkbenchRuntime'
import { readAiWorkbenchSessionSnapshot } from '@/pages/question/Edit/hooks/ai/aiWorkbenchSessionStorage'

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
  const restoredSessionSnapshot = useMemo(
    () => readAiWorkbenchSessionSnapshot(questionnaireId),
    [questionnaireId]
  )

  const [mode, setModeState] = useState<AiCopilotIntent>(
    restoredSessionSnapshot?.mode || 'generate'
  )
  const [status, setStatus] = useState<AiStreamStatus>('idle')
  const [messages, setMessages] = useState<AiChatMessage[]>([])
  const [modelList, setModelList] = useState<AiModelOption[]>([])
  const [selectedModel, setSelectedModelState] = useState(
    restoredSessionSnapshot?.selectedModel || ''
  )
  const [conversationPreferredModel, setConversationPreferredModel] = useState('')
  const [composerInput, setComposerInputState] = useState(
    restoredSessionSnapshot?.composerInput || ''
  )
  const [draftPartial, setDraftPartial] = useState<QuestionnaireDraft | null>(null)
  const [finalDraft, setFinalDraft] = useState<QuestionnaireDraft | null>(null)
  const [summary, setSummary] = useState<DraftSummary | null>(null)
  const [requestId, setRequestId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [warningMessage, setWarningMessage] = useState<string | null>(null)
  const [isBrowserOffline, setIsBrowserOffline] = useState(() =>
    typeof navigator === 'undefined' ? false : !navigator.onLine
  )
  const [localConnectionState, setLocalConnectionState] = useState<AiLocalConnectionState>('idle')
  const [localInterruptedStreamKind, setLocalInterruptedStreamKind] =
    useState<AiLocalInterruptedStreamKind | null>(null)
  const [draftApplied, setDraftApplied] = useState(false)
  const [questionPatchSet, setQuestionPatchSet] = useState<QuestionnairePatchSet | null>(null)
  const [selectedPatchIds, setSelectedPatchIds] = useState<string[]>([])
  const [rejectedPatchIds, setRejectedPatchIds] = useState<string[]>([])
  const [generateFlow, dispatchGenerateFlow] = useReducer(
    aiGenerateFlowReducer,
    initialAiGenerateFlowState
  )
  const hasQuestionnaireContent = componentList.length > 0

  const controllerRef = useRef<AbortController | null>(null)
  const streamAbortReasonRef = useRef<'user' | 'offline' | null>(null)
  const activeStreamKindRef = useRef<AiLocalInterruptedStreamKind | null>(null)
  const selectedModelSourceRef = useRef<AiWorkbenchSelectedModelSource>(
    restoredSessionSnapshot?.selectedModel ? 'restored' : 'default'
  )
  const baseVersionRef = useRef(version)
  const modeRef = useRef<AiCopilotIntent>(mode)
  const rawReplyTextRef = useRef('')
  const finalDraftRef = useRef<QuestionnaireDraft | null>(null)
  const draftAppliedRef = useRef(false)
  const baseQuestionnaireRef = useRef<QuestionnaireDraft | null>(null)
  const generateFlowRef = useRef<AiGenerateFlowState>(generateFlow)
  const hasPolishInterruptedMarkerRef = useRef(false)
  const previousQuestionnaireIdRef = useRef(questionnaireId)
  const hydrateConversationDetailHandlerRef = useRef<(detail: AiConversationDetail) => void>(
    detail => void detail
  )
  const resetConversationStateHandlerRef = useRef<() => void>(() => undefined)
  const rafFlushIdRef = useRef<number | null>(null)
  const generateDraftBaseRef = useRef<QuestionnaireDraft | null>(null)
  const pendingRestoredConversationInputRef = useRef(
    restoredSessionSnapshot?.activeConversationId && restoredSessionSnapshot.composerInput.trim()
      ? {
          conversationId: restoredSessionSnapshot.activeConversationId,
          composerInput: restoredSessionSnapshot.composerInput
        }
      : null
  )
  const bufferedUiUpdatesRef = useRef<BufferedUiUpdates>({
    promptDelta: '',
    replacePrompt: false,
    preservedPrompt: '',
    partialDraft: null
  })

  useEffect(() => {
    finalDraftRef.current = finalDraft
  }, [finalDraft])

  useEffect(() => {
    draftAppliedRef.current = draftApplied
  }, [draftApplied])

  useEffect(() => {
    if (!draftApplied) return

    setComposerInputState('')
    if (modeRef.current === 'generate') {
      dispatchGenerateFlow({ type: 'reset' })
    }
  }, [draftApplied])

  useEffect(() => {
    generateFlowRef.current = generateFlow
  }, [generateFlow])

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  useEffect(() => {
    selectedModelSourceRef.current = restoredSessionSnapshot?.selectedModel ? 'restored' : 'default'
  }, [restoredSessionSnapshot?.selectedModel, questionnaireId])

  useEffect(() => {
    pendingRestoredConversationInputRef.current =
      restoredSessionSnapshot?.activeConversationId && restoredSessionSnapshot.composerInput.trim()
        ? {
            conversationId: restoredSessionSnapshot.activeConversationId,
            composerInput: restoredSessionSnapshot.composerInput
          }
        : null
    setConversationPreferredModel('')
  }, [questionnaireId, restoredSessionSnapshot])

  const setSelectedModel = useCallback((nextModel: string) => {
    selectedModelSourceRef.current = 'user'
    setSelectedModelState(nextModel)
  }, [])

  const setSelectedModelFromSystem = useCallback(
    (nextModel: string, source: Exclude<AiWorkbenchSelectedModelSource, 'user'>) => {
      selectedModelSourceRef.current = source
      setSelectedModelState(nextModel)
    },
    []
  )

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
      preservedPrompt: '',
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
      preservedPrompt: '',
      partialDraft: null
    }
  }, [])

  const resetLocalConnectionState = useCallback(() => {
    setLocalConnectionState('idle')
    setLocalInterruptedStreamKind(null)
  }, [])

  useEffect(() => {
    return () => {
      resetBufferedUiUpdates()
    }
  }, [resetBufferedUiUpdates])

  useEffect(() => {
    apis.aiApi.getModelList().then((response: any) => {
      if (response.code === 1 && Array.isArray(response.data)) {
        setModelList(response.data)
      }
    })
  }, [])

  useEffect(() => {
    if (modelList.length === 0) return

    const nextSelectedModel = resolvePreferredAiModel({
      availableModels: modelList,
      currentModel: selectedModel,
      restoredModel: restoredSessionSnapshot?.selectedModel || '',
      conversationModel: conversationPreferredModel,
      source: selectedModelSourceRef.current
    })

    if (!nextSelectedModel.model) return

    if (nextSelectedModel.model === selectedModel || nextSelectedModel.source === 'user') {
      selectedModelSourceRef.current = nextSelectedModel.source
      return
    }

    setSelectedModelFromSystem(nextSelectedModel.model, nextSelectedModel.source)
  }, [
    conversationPreferredModel,
    modelList,
    restoredSessionSnapshot?.selectedModel,
    selectedModel,
    setSelectedModelFromSystem
  ])

  const {
    buildDraftFallback,
    hydrateConversationDetail,
    syncRuntimeStatus,
    buildQuestionnaireSnapshot,
    buildCommittedQuestionnaireSnapshot,
    buildMergedGenerateDraft,
    cancelStream: cancelLocalStream
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
  })

  const getCompatibleConversationDetail = useCallback((detail: AiConversationDetail) => {
    const hasTopLevelDraftState =
      detail.latestDraft ||
      detail.latestSummary ||
      detail.latestBaseQuestionnaire ||
      detail.lastRuntimeStatus ||
      detail.lastWorkflowStage
    const latestBatch =
      detail.latestBatches && detail.latestBatches.length > 0
        ? detail.latestBatches[detail.latestBatches.length - 1]
        : null

    if (hasTopLevelDraftState || !latestBatch) return detail

    return {
      ...detail,
      latestDraft: latestBatch.latestDraft || detail.latestDraft,
      latestSummary: latestBatch.latestSummary || detail.latestSummary,
      latestBaseQuestionnaire:
        latestBatch.latestBaseQuestionnaire || detail.latestBaseQuestionnaire,
      lastRuntimeStatus: latestBatch.lastRuntimeStatus || detail.lastRuntimeStatus,
      lastWorkflowStage: latestBatch.lastWorkflowStage || detail.lastWorkflowStage
    }
  }, [])

  const handleConversationDetailProxy = useCallback(
    (detail: AiConversationDetail) => {
      const compatibleDetail = getCompatibleConversationDetail(detail)
      const pendingRestoredConversationInput = pendingRestoredConversationInputRef.current
      const shouldPreferRestoredComposerInput =
        pendingRestoredConversationInput?.conversationId === compatibleDetail.id &&
        pendingRestoredConversationInput.composerInput.trim()
      const nextDetail = resolveHydratedConversationDetail({
        detail: compatibleDetail,
        restoredSessionSnapshot,
        hasPolishInterruptedMarker: hasPolishInterruptedMarkerRef.current
      })

      resetLocalConnectionState()
      setConversationPreferredModel(compatibleDetail.lastModel || '')
      hydrateConversationDetailHandlerRef.current(nextDetail)

      if (shouldPreferRestoredComposerInput) {
        pendingRestoredConversationInputRef.current = null
      }

      if (hasPolishInterruptedMarkerRef.current && nextDetail.lastWorkflowStage === 'polish') {
        setWarningMessage(
          currentWarningMessage => currentWarningMessage || '上次润色已中止，请重新发起。'
        )
      }
    },
    [getCompatibleConversationDetail, resetLocalConnectionState, restoredSessionSnapshot]
  )

  const handleConversationResetProxy = useCallback(() => {
    resetConversationStateHandlerRef.current()
  }, [])

  const {
    conversationList,
    activeConversationId,
    conversationLoading,
    conversationListLoading,
    activeConversationIdRef,
    loadConversationDetail,
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
    initialPreferredConversationId: restoredSessionSnapshot?.activeConversationId || null,
    message,
    modal,
    controllerRef,
    modeRef,
    finalDraftRef,
    draftAppliedRef,
    hydrateConversationDetail: handleConversationDetailProxy,
    resetConversationState: handleConversationResetProxy
  })

  const { hasPolishInterruptedMarker, persistSessionSnapshot } = useAiWorkbenchPersistence({
    questionnaireId,
    activeConversationId,
    mode,
    composerInput,
    selectedModel
  })

  const { clearDraftAfterApply, clearPendingDraftState, resetConversationRuntimeState } =
    useAiWorkbenchStateReset({
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
    })

  useEffect(() => {
    hydrateConversationDetailHandlerRef.current = hydrateConversationDetail
    resetConversationStateHandlerRef.current = () => resetConversationRuntimeState(modeRef.current)
  }, [hydrateConversationDetail, resetConversationRuntimeState])

  useEffect(() => {
    hasPolishInterruptedMarkerRef.current = hasPolishInterruptedMarker
  }, [hasPolishInterruptedMarker])

  useEffect(() => {
    if (previousQuestionnaireIdRef.current === questionnaireId) return

    previousQuestionnaireIdRef.current = questionnaireId

    const nextMode = restoredSessionSnapshot?.mode || 'generate'
    resetConversationRuntimeState(nextMode)
    setComposerInputState(restoredSessionSnapshot?.composerInput || '')
    setSelectedModelState(restoredSessionSnapshot?.selectedModel || '')
    setConversationPreferredModel('')
  }, [questionnaireId, resetConversationRuntimeState, restoredSessionSnapshot])

  useEffect(() => {
    if (!hasPolishInterruptedMarker) return
    if (conversationListLoading) return
    if (conversationList.length > 0 || activeConversationId) return

    setWarningMessage(
      currentWarningMessage => currentWarningMessage || '上次润色已中止，请重新发起。'
    )
  }, [
    activeConversationId,
    conversationList.length,
    conversationListLoading,
    hasPolishInterruptedMarker
  ])

  useEffect(() => {
    if (conversationListLoading) return
    if (conversationList.length > 0 || activeConversationId) return

    setConversationPreferredModel('')
  }, [activeConversationId, conversationList.length, conversationListLoading])

  const cancelStream = useAiCancelStream({
    mode,
    status,
    composerInput,
    requestId,
    draftPartial,
    finalDraft,
    summary,
    activeConversationIdRef,
    controllerRef,
    streamAbortReasonRef,
    bufferedUiUpdatesRef,
    finalDraftRef,
    baseQuestionnaireRef,
    dispatchGenerateFlow,
    setLocalConnectionState,
    setLocalInterruptedStreamKind,
    setComposerInputState,
    setDraftPartial,
    setFinalDraft,
    persistConversationDraftState,
    refreshConversationList,
    cancelLocalStream
  })

  const {
    setMode,
    ensureActiveConversation,
    openFreshEditEntrySession,
    openFreshGenerateEntrySession,
    setComposerInput,
    discardDraft
  } = useAiWorkbenchSession({
    mode,
    status,
    composerInput,
    messagesLength: messages.length,
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
  })

  const { applyDraft: applyDraftInternal, applyPatchSelection } = useAiDraftApply({
    mode,
    status,
    version,
    selectedId,
    componentList,
    pageConfig,
    draftPartial,
    finalDraft,
    draftApplied,
    questionPatchSet,
    selectedPatchIds,
    rejectedPatchIds,
    baseVersionRef,
    dispatch,
    message,
    modal,
    clearDraftAfterApply,
    persistConversationDraftState,
    onDraftApplied,
    setDraftApplied
  })

  const applyGeneratePageConfig = useCallback(
    (draft: QuestionnaireDraft) => {
      dispatch(
        resetPageConfig({
          title: draft.title,
          description: draft.description,
          footerText: draft.footerText
        })
      )
    },
    [dispatch]
  )

  const runDraftStream = useAiDraftStream({
    questionnaireId,
    selectedModel,
    version,
    focusedComponentId: selectedId,
    messages,
    message,
    controllerRef,
    streamAbortReasonRef,
    activeStreamKindRef,
    activeConversationIdRef,
    baseVersionRef,
    finalDraftRef,
    draftAppliedRef,
    rawReplyTextRef,
    baseQuestionnaireRef,
    generateDraftBaseRef,
    bufferedUiUpdatesRef,
    setActiveConversationId,
    setStatus,
    setMessages,
    setErrorMessage,
    setLocalConnectionState,
    setLocalInterruptedStreamKind,
    setDraftPartial,
    setFinalDraft,
    setSummary,
    setRequestId,
    setWarningMessage,
    setDraftApplied,
    applyGeneratePageConfig,
    dispatchGenerateFlow,
    ensureActiveConversation,
    buildQuestionnaireSnapshot,
    buildCommittedQuestionnaireSnapshot,
    buildDraftFallback,
    buildMergedGenerateDraft,
    refreshConversationList,
    scheduleBufferedUiFlush,
    flushBufferedUiUpdates,
    resetBufferedUiUpdates,
    persistConversationDraftState,
    syncRuntimeStatus
  })

  const runPromptPolishStream = useAiPromptPolishStream({
    questionnaireId,
    selectedModel,
    version,
    messages,
    message,
    controllerRef,
    streamAbortReasonRef,
    activeStreamKindRef,
    activeConversationIdRef,
    baseVersionRef,
    rawReplyTextRef,
    generateFlowRef,
    bufferedUiUpdatesRef,
    setActiveConversationId,
    setStatus,
    setMessages,
    setErrorMessage,
    setLocalConnectionState,
    setLocalInterruptedStreamKind,
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

  const {
    togglePatchSelection,
    selectAllPatches,
    clearPatchSelection,
    applyPatchById,
    rejectPatchById,
    applyDraft
  } = useAiPatchReview({
    mode,
    componentList,
    pageConfig,
    draftPartial,
    finalDraft,
    questionPatchSet,
    selectedPatchIds,
    rejectedPatchIds,
    baseVersionRef,
    baseQuestionnaireRef,
    setDraftApplied,
    setQuestionPatchSet,
    setSelectedPatchIds,
    setRejectedPatchIds,
    applyPatchSelection,
    applyDraftInternal
  })

  const { sendInstruction, polishInstruction, retryPromptPolish, retryGenerate } =
    useAiInstructionActions({
      mode,
      composerInput,
      selectedId,
      message,
      generateFlowRef,
      setComposerInputState,
      dispatchGenerateFlow,
      ensureActiveConversation,
      runDraftStream,
      runPromptPolishStream
    })

  const { refreshBackgroundRunStatus, stopBackgroundRun, recoverInterruptedRun } =
    useAiInterruptedRunRecovery({
      status,
      version,
      selectedModel,
      message,
      controllerRef,
      streamAbortReasonRef,
      activeStreamKindRef,
      activeConversationIdRef,
      localConnectionState,
      localInterruptedStreamKind,
      setIsBrowserOffline,
      setLocalConnectionState,
      resetLocalConnectionState,
      setSelectedModel: nextModel => setSelectedModelFromSystem(nextModel, 'conversation'),
      setComposerInputState,
      loadConversationDetail,
      refreshConversationList,
      runDraftStream
    })

  const currentQuestionnaire: QuestionnaireDraft = {
    title: pageConfig.title,
    description: pageConfig.description,
    footerText: pageConfig.footerText,
    components: componentList
  }
  const reviewablePatches = getReviewablePatches(mode, questionPatchSet)
  const reviewablePatchStatuses = reviewablePatches.map(patch =>
    getPatchStatus(currentQuestionnaire, patch, selectedPatchIds, rejectedPatchIds)
  )
  const patchStatusSignature = reviewablePatchStatuses.join('|')
  const hasUnhandledReviewablePatchChanges = reviewablePatchStatuses.some(
    patchStatus => patchStatus === 'pending' || patchStatus === 'selected'
  )
  const hasPendingPatchResult = reviewablePatches.length > 0 && hasUnhandledReviewablePatchChanges
  const hasInterruptedRun = status === 'background_running' || status === 'resume_available'
  const hasLocalInterruptedRun = localConnectionState !== 'idle'
  const hasPendingDraftResult =
    !questionPatchSet?.patches.length &&
    Boolean((finalDraft || (status === 'cancelled' ? draftPartial : null)) && !draftApplied)
  const hasPendingAiResult =
    hasPendingPatchResult || hasPendingDraftResult || hasInterruptedRun || hasLocalInterruptedRun
  const notifyPendingAiResult = useCallback(() => {
    if (hasLocalInterruptedRun) {
      message.warning('请先处理当前中断任务（等待刷新、恢复或放弃）后再继续。')
      return
    }

    if (hasInterruptedRun) {
      message.warning('请先处理当前中断任务（恢复或放弃）后再继续。')
      return
    }

    message.warning('请先处理当前 AI 结果（应用或放弃）后再继续。')
  }, [hasInterruptedRun, hasLocalInterruptedRun, message])

  useEffect(() => {
    if (!questionPatchSet || questionPatchSet.patches.length === 0) return
    if (hasUnhandledReviewablePatchChanges) {
      return
    }

    void persistConversationDraftState(
      {
        lastInstruction: null,
        latestDraft: null,
        latestSummary: null,
        latestBaseQuestionnaire: null,
        latestBatches: null,
        lastRuntimeStatus: 'done',
        lastWorkflowStage: mode
      },
      {
        silent: false,
        failureMessage: '同步 AI 会话完成状态失败，请刷新后确认。'
      }
    )
  }, [
    hasUnhandledReviewablePatchChanges,
    mode,
    patchStatusSignature,
    persistConversationDraftState,
    questionPatchSet
  ])

  useAiWorkbenchLeaveGuard({
    questionnaireId,
    activeConversationId,
    mode,
    composerInput,
    selectedModel,
    status,
    hasPendingAiResult,
    activeStreamKindRef,
    bufferedUiUpdatesRef,
    flushBufferedUiUpdates,
    persistSessionSnapshot
  })

  const guardedSetMode = useCallback(
    (nextMode: AiCopilotIntent) => {
      if (nextMode === mode) return
      if (hasPendingAiResult) {
        notifyPendingAiResult()
        return
      }

      setMode(nextMode)
    },
    [hasPendingAiResult, mode, notifyPendingAiResult, setMode]
  )

  const guardedOpenNewConversation = useCallback(() => {
    if (hasPendingAiResult) {
      notifyPendingAiResult()
      return false
    }

    return openNewConversation()
  }, [hasPendingAiResult, notifyPendingAiResult, openNewConversation])

  const guardedSelectConversation = useCallback(
    (conversationId: number) => {
      if (conversationId === activeConversationId) return true
      if (hasPendingAiResult) {
        notifyPendingAiResult()
        return false
      }

      return selectConversation(conversationId)
    },
    [activeConversationId, hasPendingAiResult, notifyPendingAiResult, selectConversation]
  )

  const guardedSendInstruction = useCallback(
    (instruction: string) => {
      if (hasPendingAiResult) {
        notifyPendingAiResult()
        return false
      }

      return sendInstruction(instruction)
    },
    [hasPendingAiResult, notifyPendingAiResult, sendInstruction]
  )

  const guardedPolishInstruction = useCallback(
    (instruction?: string) => {
      if (hasPendingAiResult) {
        notifyPendingAiResult()
        return false
      }

      return polishInstruction(instruction)
    },
    [hasPendingAiResult, notifyPendingAiResult, polishInstruction]
  )

  const guardedRetryPromptPolish = useCallback(() => {
    if (hasPendingAiResult) {
      notifyPendingAiResult()
      return
    }

    return retryPromptPolish()
  }, [hasPendingAiResult, notifyPendingAiResult, retryPromptPolish])

  const guardedRetryGenerate = useCallback(() => {
    if (hasPendingAiResult) {
      notifyPendingAiResult()
      return
    }

    return retryGenerate()
  }, [hasPendingAiResult, notifyPendingAiResult, retryGenerate])

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
    isBrowserOffline,
    localConnectionState,
    localInterruptedStreamKind,
    draftApplied,
    questionPatchSet,
    selectedPatchIds,
    rejectedPatchIds,
    hasPendingAiResult,
    generateFlow,
    setMode: guardedSetMode,
    setSelectedModel,
    setComposerInput,
    openFreshEditEntrySession,
    openFreshGenerateEntrySession,
    openNewConversation: guardedOpenNewConversation,
    selectConversation: guardedSelectConversation,
    renameConversation,
    toggleConversationPin,
    removeConversation,
    sendInstruction: guardedSendInstruction,
    polishInstruction: guardedPolishInstruction,
    cancelStream,
    recoverInterruptedRun,
    refreshBackgroundRunStatus,
    stopBackgroundRun,
    discardDraft,
    applyDraft,
    togglePatchSelection,
    selectAllPatches,
    clearPatchSelection,
    applyPatchById,
    rejectPatchById,
    retryPromptPolish: guardedRetryPromptPolish,
    retryGenerate: guardedRetryGenerate
  }
}

export default useAiWorkbench
