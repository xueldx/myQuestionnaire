import { App } from 'antd'
import { startTransition, useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import apis from '@/apis'
import { RootState } from '@/store'
import { AppDispatch } from '@/store'
import { resetComponents } from '@/store/modules/componentsSlice'
import { resetPageConfig } from '@/store/modules/pageConfigSlice'
import { getComponentDefaultProps } from '@/utils/getComponentDefaultProps'
import { normalizeQuestionnaireComponentList } from '@/utils/normalizeQuestionComponent'
import {
  AiConversationDetail,
  AiConversationSummary,
  AiChatMessage,
  AiCopilotIntent,
  AiCopilotStreamRequest,
  AiGenerateFlowState,
  AiModelOption,
  AiProcessMessageMeta,
  AiProcessScenario,
  AiProcessStep,
  AiProcessStepStatus,
  AiRuntimePhase,
  AiStreamStatus,
  DraftSummary,
  QuestionnaireDraft
} from '@/pages/question/Edit/components/aiCopilotTypes'
import {
  aiGenerateFlowReducer,
  initialAiGenerateFlowState
} from '@/pages/question/Edit/hooks/aiGenerateFlowMachine'
import {
  getConnectingProcessStep,
  getPhaseProcessStep,
  getProcessSummary,
  getProgressAssistantMessage,
  getToolProcessStep,
  inferHistoryProcessScenario,
  resolveProcessScenario,
  sortProcessSteps
} from '@/pages/question/Edit/hooks/aiProcessHelpers'
import {
  getComposerGuide,
  shouldConfirmDraftRegenerate
} from '@/pages/question/Edit/hooks/aiDraftInteraction'
import { mergeGenerateDraftIntoBase } from '@/pages/question/Edit/hooks/aiGenerateDraftMerge'

const ensurePlainObject = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

const normalizeDraft = (
  draft: QuestionnaireDraft,
  fallback: QuestionnaireDraft,
  idPrefix: string
): QuestionnaireDraft => {
  const draftComponents = (draft.components || [])
    .map((component, index) => {
      const defaultInfo = getComponentDefaultProps(component.type)
      if (!defaultInfo) return null

      const title =
        (typeof component.title === 'string' && component.title.trim()) ||
        (typeof ensurePlainObject(component.props).title === 'string'
          ? String(ensurePlainObject(component.props).title)
          : defaultInfo.title)

      const props = {
        ...ensurePlainObject(defaultInfo.props),
        ...ensurePlainObject(component.props),
        title
      }

      return {
        fe_id: component.fe_id || `${idPrefix}-${index + 1}`,
        type: component.type,
        title,
        props
      }
    })
    .filter(Boolean) as QuestionnaireDraft['components']
  const normalizedComponents = normalizeQuestionnaireComponentList(draftComponents)

  return {
    title: draft.title || fallback.title,
    description: draft.description || fallback.description,
    footerText: draft.footerText || fallback.footerText,
    components: normalizedComponents
  }
}

const getEmptyDraftFallback = (): QuestionnaireDraft => ({
  title: '未命名问卷',
  description: '',
  footerText: '',
  components: []
})

const PROCESS_MESSAGE_ID_PREFIX = 'ai-process'

const createInitialProcessMessage = (
  scenario: AiProcessScenario,
  status: AiStreamStatus
): AiChatMessage => ({
  id: `${PROCESS_MESSAGE_ID_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  role: 'process',
  kind: 'process',
  content: '',
  metadata: {
    collapsed: false,
    summary: getProcessSummary(scenario, status),
    steps: [
      {
        ...getConnectingProcessStep(scenario),
        status: 'running'
      }
    ]
  } satisfies AiProcessMessageMeta
})

const normalizeProcessMetadata = (
  metadata: AiChatMessage['metadata'],
  fallbackSummary: string
): AiProcessMessageMeta => {
  const normalized = ensurePlainObject(metadata)
  const rawSteps = Array.isArray(normalized.steps) ? normalized.steps : []
  const steps = rawSteps
    .map(step => {
      const nextStep = ensurePlainObject(step)
      const status = nextStep.status
      if (
        typeof nextStep.id !== 'string' ||
        typeof nextStep.label !== 'string' ||
        !['pending', 'running', 'done', 'error'].includes(String(status))
      ) {
        return null
      }

      return {
        id: nextStep.id,
        label: nextStep.label,
        status: status as AiProcessStepStatus,
        summary: typeof nextStep.summary === 'string' ? nextStep.summary : undefined
      }
    })
    .filter(Boolean) as AiProcessStep[]

  return {
    collapsed: Boolean(normalized.collapsed),
    summary:
      typeof normalized.summary === 'string' && normalized.summary.trim()
        ? normalized.summary
        : fallbackSummary,
    steps
  }
}

const updateProcessMessage = (
  messages: AiChatMessage[],
  updater: (metadata: AiProcessMessageMeta) => AiProcessMessageMeta,
  scenario: AiProcessScenario,
  status: AiStreamStatus
) => {
  const nextMessages = [...messages]
  const processMessageIndex = [...nextMessages].map(message => message.kind).lastIndexOf('process')
  const processMessage =
    processMessageIndex >= 0
      ? nextMessages[processMessageIndex]
      : createInitialProcessMessage(scenario, status)

  const nextMetadata = updater(
    normalizeProcessMetadata(processMessage.metadata, getProcessSummary(scenario, status))
  )
  const nextProcessMessage: AiChatMessage = {
    ...processMessage,
    role: 'process',
    kind: 'process',
    content: '',
    metadata: nextMetadata
  }

  if (processMessageIndex >= 0) {
    nextMessages[processMessageIndex] = nextProcessMessage
    return nextMessages
  }

  const assistantMessageIndex = nextMessages.findIndex(message => message.role === 'assistant')
  if (assistantMessageIndex >= 0) {
    nextMessages.splice(assistantMessageIndex, 0, nextProcessMessage)
    return nextMessages
  }

  nextMessages.push(nextProcessMessage)
  return nextMessages
}

const restartProcessMessage = (
  messages: AiChatMessage[],
  scenario: AiProcessScenario,
  status: AiStreamStatus
) => {
  const nextMessages = [...messages]
  const freshProcessMessage = createInitialProcessMessage(scenario, status)
  const processMessageIndex = [...nextMessages].map(message => message.kind).lastIndexOf('process')
  const lastAssistantIndex = [...nextMessages].map(message => message.role).lastIndexOf('assistant')

  if (processMessageIndex >= 0 && processMessageIndex === lastAssistantIndex - 1) {
    nextMessages[processMessageIndex] = freshProcessMessage
    return nextMessages
  }

  if (lastAssistantIndex >= 0) {
    nextMessages.splice(lastAssistantIndex, 0, freshProcessMessage)
    return nextMessages
  }

  nextMessages.push(freshProcessMessage)
  return nextMessages
}

const updateProcessByStatus = (
  messages: AiChatMessage[],
  scenario: AiProcessScenario,
  status: Extract<
    AiStreamStatus,
    'connecting' | 'polishing' | 'thinking' | 'answering' | 'drafting'
  >
) => {
  const step =
    status === 'connecting'
      ? getConnectingProcessStep(scenario)
      : getPhaseProcessStep(scenario, status as AiRuntimePhase)

  return updateProcessMessage(
    messages,
    metadata =>
      setProcessStepStatus(metadata, step, 'running', getProcessSummary(scenario, status)),
    scenario,
    status
  )
}

const updateProcessByToolEvent = (
  messages: AiChatMessage[],
  scenario: AiProcessScenario,
  toolName: string,
  stepStatus: AiProcessStepStatus
) => {
  const step = getToolProcessStep(scenario, toolName)
  if (!step) return messages

  return updateProcessMessage(
    messages,
    metadata => setProcessStepStatus(metadata, step, stepStatus, step.label),
    scenario,
    'thinking'
  )
}

const finalizeProcessMessage = (
  messages: AiChatMessage[],
  scenario: AiProcessScenario,
  status: Extract<AiStreamStatus, 'draft_ready' | 'done' | 'error'>
) =>
  updateProcessMessage(
    messages,
    metadata => finalizeProcessMetadata(metadata, scenario, status),
    scenario,
    status
  )

const setProcessStepStatus = (
  metadata: AiProcessMessageMeta,
  step: Pick<AiProcessStep, 'id' | 'label'>,
  nextStatus: AiProcessStepStatus,
  summary: string
): AiProcessMessageMeta => {
  const nextSteps = metadata.steps.filter(
    item => item.id !== 'connecting' || step.id === 'connecting'
  )
  const existingStepIndex = nextSteps.findIndex(item => item.id === step.id)
  const previousRunningStepIndex = nextSteps.findIndex(item => item.status === 'running')

  if (previousRunningStepIndex >= 0 && nextSteps[previousRunningStepIndex].id !== step.id) {
    nextSteps[previousRunningStepIndex] = {
      ...nextSteps[previousRunningStepIndex],
      status: nextSteps[previousRunningStepIndex].status === 'error' ? 'error' : 'done'
    }
  }

  if (existingStepIndex >= 0) {
    nextSteps[existingStepIndex] = {
      ...nextSteps[existingStepIndex],
      label: step.label,
      status: nextStatus
    }
  } else {
    nextSteps.push({
      id: step.id,
      label: step.label,
      status: nextStatus
    })
  }

  return {
    ...metadata,
    collapsed: false,
    summary,
    steps: sortProcessSteps(nextSteps)
  }
}

const finalizeProcessMetadata = (
  metadata: AiProcessMessageMeta,
  scenario: AiProcessScenario,
  status: Extract<AiStreamStatus, 'draft_ready' | 'done' | 'error'>
): AiProcessMessageMeta => ({
  ...metadata,
  collapsed: status !== 'error',
  summary: getProcessSummary(scenario, status),
  steps: sortProcessSteps(
    metadata.steps.map(step => ({
      ...step,
      status:
        status === 'error'
          ? step.status === 'running'
            ? 'error'
            : step.status
          : step.status === 'running'
          ? 'done'
          : step.status
    }))
  )
})

const replaceLastAssistantMessage = (messages: AiChatMessage[], nextContent: string) => {
  const nextMessages = [...messages]
  const lastAssistantIndex = [...nextMessages].map(message => message.role).lastIndexOf('assistant')

  if (lastAssistantIndex === -1) {
    nextMessages.push({ role: 'assistant', kind: 'chat', content: nextContent })
    return nextMessages
  }

  const lastAssistantMessage = nextMessages[lastAssistantIndex]
  nextMessages[lastAssistantIndex] = {
    ...lastAssistantMessage,
    content: nextContent
  }

  return nextMessages
}

const sanitizeAssistantReply = (content: string) => {
  return content
    .replace(/\r/g, '')
    .replace(/^<<<[A-Z_]+>>>$/gm, '')
    .replace(/^<<<END_[A-Z_]+>>>$/gm, '')
    .replace(/^<<<END_DRAFT>>>$/gm, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const formatAssistantBubbleReply = (content: string, fallback: string) => {
  const sanitized = sanitizeAssistantReply(content)
  if (!sanitized) return fallback

  return sanitized
}

const buildHistoryProcessMessage = (
  toolMessages: AiChatMessage[],
  scenario: AiProcessScenario,
  suffix: string
): AiChatMessage | null => {
  const hasError = toolMessages.some(
    message =>
      message.kind === 'tool_result' && ensurePlainObject(message.metadata).status === 'error'
  )
  const summaryStatus: Extract<AiStreamStatus, 'done' | 'error'> = hasError ? 'error' : 'done'
  const metadata = toolMessages.reduce<AiProcessMessageMeta>(
    (previousMetadata, message) => {
      const step = getToolProcessStep(scenario, message.toolName || '')
      if (!step) return previousMetadata

      return setProcessStepStatus(
        previousMetadata,
        step,
        message.kind === 'tool_result' && ensurePlainObject(message.metadata).status === 'error'
          ? 'error'
          : 'done',
        getProcessSummary(scenario, summaryStatus)
      )
    },
    {
      collapsed: true,
      summary: getProcessSummary(scenario, summaryStatus),
      steps: []
    }
  )

  if (metadata.steps.length === 0) return null

  return {
    id: `${PROCESS_MESSAGE_ID_PREFIX}-history-${suffix}`,
    role: 'process',
    kind: 'process',
    content: '',
    metadata
  }
}

const normalizeConversationMessages = (
  messages: AiChatMessage[],
  requestIntent: AiCopilotIntent
) => {
  if (!Array.isArray(messages)) return []

  const normalizedMessages = messages.map(message => ({
    id: message.id,
    role: message.role,
    kind: message.kind || (message.role === 'tool' ? 'tool_result' : 'chat'),
    content: message.content || '',
    toolName: message.toolName ?? null,
    metadata: message.metadata ?? null,
    createdAt: message.createdAt
  })) as AiChatMessage[]

  const nextMessages: AiChatMessage[] = []
  let toolBuffer: AiChatMessage[] = []

  const flushToolBuffer = (nextMessage?: AiChatMessage | null) => {
    if (toolBuffer.length === 0) return
    const scenario = inferHistoryProcessScenario({
      requestIntent,
      previousMessage: nextMessages[nextMessages.length - 1],
      nextMessage
    })
    const processMessage = buildHistoryProcessMessage(
      toolBuffer,
      scenario,
      String(nextMessages.length)
    )
    if (processMessage) {
      nextMessages.push(processMessage)
    }
    toolBuffer = []
  }

  normalizedMessages.forEach(message => {
    if (message.role === 'tool') {
      toolBuffer.push(message)
      return
    }

    flushToolBuffer(message)
    nextMessages.push(message)
  })

  flushToolBuffer()

  return nextMessages
}

const buildPersistedDraft = (
  draft: QuestionnaireDraft | null,
  fallback: QuestionnaireDraft,
  idPrefix: string
) => {
  if (!draft) return null
  return normalizeDraft(draft, fallback, idPrefix)
}

const getConversationHistory = (messages: AiChatMessage[]) =>
  messages.filter(message => message.role === 'user' || message.role === 'assistant')

type DraftStreamOptions = {
  requestIntent: AiCopilotIntent
  instruction: string
  originalInstruction?: string
  isRetry?: boolean
  startStatus: AiStreamStatus
  assistantPlaceholder: string
  appendUserMessage: boolean
}

type BufferedUiUpdates = {
  promptDelta: string
  replacePrompt: boolean
  partialDraft: QuestionnaireDraft | null
}

const ACTIVE_STREAM_STATUSES: AiStreamStatus[] = [
  'connecting',
  'polishing',
  'thinking',
  'answering',
  'drafting'
]

const useAiWorkbench = (questionnaireId: string) => {
  const { message, modal } = App.useApp()
  const dispatch = useDispatch<AppDispatch>()
  const componentList = useSelector((state: RootState) => state.components.componentList)
  const selectedId = useSelector((state: RootState) => state.components.selectedId)
  const version = useSelector((state: RootState) => state.components.version)
  const pageConfig = useSelector((state: RootState) => state.pageConfig)

  const [mode, setModeState] = useState<AiCopilotIntent>('generate')
  const [status, setStatus] = useState<AiStreamStatus>('idle')
  const [messages, setMessages] = useState<AiChatMessage[]>([])
  const [conversationList, setConversationList] = useState<AiConversationSummary[]>([])
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null)
  const [conversationLoading, setConversationLoading] = useState(false)
  const [conversationListLoading, setConversationListLoading] = useState(false)
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
  const createConversationPromiseRef = useRef<Promise<AiConversationDetail | null> | null>(null)
  const baseVersionRef = useRef(version)
  const activeConversationIdRef = useRef<number | null>(null)
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
    activeConversationIdRef.current = activeConversationId
  }, [activeConversationId])

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
    (detail: AiConversationDetail) => {
      resetBufferedUiUpdates()
      activeConversationIdRef.current = detail.id
      modeRef.current = detail.intent
      setActiveConversationId(detail.id)
      setModeState(detail.intent)
      setMessages(normalizeConversationMessages(detail.messages || [], detail.intent))
      setComposerInputState(detail.lastInstruction || '')
      setRequestId(null)
      setErrorMessage(null)
      setWarningMessage(null)
      setDraftApplied(false)
      rawReplyTextRef.current = ''

      const fallbackDraft = buildDraftFallback(detail.intent)
      const restoredDraft = buildPersistedDraft(
        detail.latestDraft,
        fallbackDraft,
        `conversation-${detail.id}-latest`
      )

      setDraftPartial(restoredDraft)
      setFinalDraft(restoredDraft)
      finalDraftRef.current = restoredDraft
      draftAppliedRef.current = false
      setSummary(detail.latestSummary || null)
      setStatus(restoredDraft ? 'draft_ready' : detail.messages?.length ? 'done' : 'idle')

      dispatchGenerateFlow({ type: 'reset' })
      if (detail.intent === 'generate' && detail.lastInstruction) {
        dispatchGenerateFlow({
          type: 'edit_refined_prompt',
          prompt: detail.lastInstruction
        })
      }
    },
    [buildDraftFallback, resetBufferedUiUpdates]
  )

  const loadConversationDetail = useCallback(
    async (conversationId: number) => {
      if (!conversationId) return null

      setConversationLoading(true)
      try {
        const response = await apis.aiApi.getConversationDetail(conversationId)
        if (response.code !== 1 || !response.data) {
          throw new Error(response.msg || '获取会话详情失败')
        }

        hydrateConversationDetail(response.data)
        return response.data
      } catch (error: any) {
        message.error(error?.message || '获取会话详情失败')
        return null
      } finally {
        setConversationLoading(false)
      }
    },
    [hydrateConversationDetail, message]
  )

  const persistConversationDraftState = useCallback(
    async (payload: {
      lastInstruction?: string | null
      latestDraft?: QuestionnaireDraft | null
      latestSummary?: DraftSummary | null
    }) => {
      const conversationId = activeConversationIdRef.current
      if (!conversationId) return

      try {
        await apis.aiApi.updateConversation(conversationId, payload)
      } catch (error) {
        console.warn('同步 AI 会话草稿状态失败:', error)
      }
    },
    []
  )

  const refreshConversationList = useCallback(
    async (
      preferredConversationId?: number | null,
      options?: {
        hydrateDetail?: boolean
      }
    ) => {
      const numericQuestionnaireId = Number(questionnaireId) || 0
      if (!numericQuestionnaireId) return []

      setConversationListLoading(true)
      try {
        const response = await apis.aiApi.getConversationList(numericQuestionnaireId)
        const nextList = response.code === 1 && Array.isArray(response.data) ? response.data : []
        setConversationList(nextList)

        const targetConversationId =
          preferredConversationId ?? activeConversationIdRef.current ?? nextList[0]?.id ?? null

        if (
          options?.hydrateDetail &&
          targetConversationId &&
          targetConversationId !== activeConversationIdRef.current &&
          nextList.some(item => item.id === targetConversationId)
        ) {
          await loadConversationDetail(targetConversationId)
        }

        return nextList
      } catch (error: any) {
        message.error(error?.message || '获取会话列表失败')
        return []
      } finally {
        setConversationListLoading(false)
      }
    },
    [loadConversationDetail, message, questionnaireId]
  )

  const createConversation = useCallback(
    async (intent?: AiCopilotIntent, title?: string) => {
      if (createConversationPromiseRef.current) {
        return createConversationPromiseRef.current
      }

      const creationTask = (async () => {
        if (controllerRef.current) {
          message.warning('请先停止当前 AI 会话，再新建会话')
          return null
        }

        const numericQuestionnaireId = Number(questionnaireId) || 0
        if (!numericQuestionnaireId) return null
        const nextIntent = intent || modeRef.current

        setConversationLoading(true)
        try {
          const response = await apis.aiApi.createConversation({
            questionnaireId: numericQuestionnaireId,
            intent: nextIntent,
            title
          })
          if (response.code !== 1 || !response.data) {
            throw new Error(response.msg || '创建会话失败')
          }

          hydrateConversationDetail(response.data)
          await refreshConversationList(response.data.id)
          return response.data
        } catch (error: any) {
          message.error(error?.message || '创建会话失败')
          return null
        } finally {
          setConversationLoading(false)
        }
      })()

      createConversationPromiseRef.current = creationTask

      try {
        return await creationTask
      } finally {
        if (createConversationPromiseRef.current === creationTask) {
          createConversationPromiseRef.current = null
        }
      }
    },
    [hydrateConversationDetail, message, questionnaireId, refreshConversationList]
  )

  const openNewConversation = useCallback(async () => {
    if (finalDraftRef.current && !draftAppliedRef.current) {
      modal.confirm({
        title: '切换到新会话',
        content:
          '当前会话里还有未应用到编辑器的 AI 草稿。确认新建会话并切换吗？当前草稿会保留在原会话中。',
        okText: '确认切换',
        cancelText: '取消',
        onOk: async () => {
          await createConversation()
        }
      })
      return null
    }

    return createConversation()
  }, [createConversation, modal])

  const selectConversation = useCallback(
    async (conversationId: number) => {
      if (conversationId === activeConversationIdRef.current) return
      if (controllerRef.current) {
        message.warning('请先停止当前 AI 会话，再切换会话')
        return
      }

      await loadConversationDetail(conversationId)
      await refreshConversationList(conversationId)
    },
    [loadConversationDetail, message, refreshConversationList]
  )

  const renameConversation = useCallback(
    async (conversationId: number, nextTitle: string) => {
      if (!conversationId) return false
      if (controllerRef.current) {
        message.warning('请先停止当前 AI 会话，再重命名会话')
        return false
      }

      const normalizedTitle = nextTitle.trim()
      if (!normalizedTitle) {
        message.warning('请输入会话标题')
        return false
      }

      const response = await apis.aiApi.updateConversation(conversationId, {
        title: normalizedTitle
      })
      if (response.code !== 1) {
        message.error(response.msg || '重命名失败')
        return false
      }

      await refreshConversationList(conversationId)
      return true
    },
    [message, refreshConversationList]
  )

  const toggleConversationPin = useCallback(
    async (conversationId: number) => {
      if (!conversationId) return false
      const targetConversation = conversationList.find(item => item.id === conversationId)
      if (!targetConversation) return false

      const response = await apis.aiApi.updateConversation(conversationId, {
        isPinned: !targetConversation.isPinned
      })
      if (response.code !== 1) {
        message.error(response.msg || '更新置顶状态失败')
        return false
      }

      await refreshConversationList(activeConversationIdRef.current || conversationId)
      return true
    },
    [conversationList, message, refreshConversationList]
  )

  const removeConversation = useCallback(
    async (conversationId: number) => {
      if (!conversationId) return
      if (controllerRef.current) {
        message.warning('请先停止当前 AI 会话，再删除会话')
        return
      }

      modal.confirm({
        title: '删除会话',
        content: '删除后将清空该会话的消息记录，是否继续？',
        okText: '删除',
        cancelText: '取消',
        onOk: async () => {
          const response = await apis.aiApi.deleteConversation(conversationId)
          if (response.code !== 1) {
            message.error(response.msg || '删除会话失败')
            return Promise.reject(new Error(response.msg || 'delete failed'))
          }

          const isDeletingActiveConversation = conversationId === activeConversationIdRef.current

          if (!isDeletingActiveConversation) {
            await refreshConversationList(activeConversationIdRef.current)
            return
          }

          const nextList = await refreshConversationList(null)
          const fallbackConversation = nextList[0]
          if (fallbackConversation) {
            await loadConversationDetail(fallbackConversation.id)
            return
          }

          activeConversationIdRef.current = null
          dispatchGenerateFlow({ type: 'reset' })
          setActiveConversationId(null)
          setMessages([])
          setComposerInputState('')
          setDraftPartial(null)
          setFinalDraft(null)
          setSummary(null)
          setStatus('idle')
        }
      })
    },
    [loadConversationDetail, message, modal, refreshConversationList]
  )

  useEffect(() => {
    void refreshConversationList(undefined, {
      hydrateDetail: true
    })
  }, [questionnaireId, refreshConversationList])

  const syncRuntimeStatus = useCallback(
    (
      nextStatus: Extract<
        AiStreamStatus,
        'connecting' | 'polishing' | 'thinking' | 'answering' | 'drafting'
      >,
      requestIntent: AiCopilotIntent,
      processScenario: AiProcessScenario,
      fallbackMessage: string
    ) => {
      setStatus(nextStatus)

      if (requestIntent === 'generate') {
        dispatchGenerateFlow({
          type: 'sync_runtime_phase',
          phase: nextStatus
        })
      }

      setMessages(previousMessages =>
        updateProcessByStatus(
          replaceLastAssistantMessage(
            previousMessages,
            getProgressAssistantMessage(processScenario, nextStatus, fallbackMessage)
          ),
          processScenario,
          nextStatus
        )
      )
    },
    []
  )

  const getSnapshot = useCallback(() => {
    return {
      title: pageConfig.title,
      description: pageConfig.description,
      footerText: pageConfig.footerText,
      components: normalizeQuestionnaireComponentList(componentList)
    }
  }, [componentList, pageConfig])

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

    return getSnapshot()
  }, [getSnapshot])

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
    [componentList, selectedId]
  )

  const cancelStream = useCallback(
    (showMessage = true) => {
      if (!controllerRef.current) return
      controllerRef.current.abort()
      controllerRef.current = null
      resetBufferedUiUpdates()

      if (mode === 'generate') {
        dispatchGenerateFlow({ type: 'cancel' })
      }

      setStatus(currentStatus => (currentStatus === 'draft_ready' ? currentStatus : 'cancelled'))
      if (showMessage) {
        message.info('已停止当前 AI 会话')
      }
    },
    [message, mode, resetBufferedUiUpdates]
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
    composerInput,
    clearPendingDraftState,
    messages.length,
    mode,
    persistConversationDraftState,
    status
  ])

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

  const resetConversationDraftView = useCallback(
    (nextMode: AiCopilotIntent) => {
      resetBufferedUiUpdates()
      activeConversationIdRef.current = null
      modeRef.current = nextMode
      finalDraftRef.current = null
      draftAppliedRef.current = false
      setModeState(nextMode)
      setActiveConversationId(null)
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

  const applyGenerateDraft = useCallback(
    (draft: QuestionnaireDraft) => {
      const normalizedComponents = normalizeQuestionnaireComponentList(draft.components)

      if (normalizedComponents.length === 0) {
        message.warning('当前 AI 草稿中没有可插入的组件')
        return
      }

      const nextSelectedId =
        normalizedComponents.find(component => component.fe_id === selectedId)?.fe_id ||
        normalizedComponents[0]?.fe_id ||
        ''

      dispatch(
        resetComponents({
          selectedId: nextSelectedId,
          componentList: normalizedComponents,
          version
        })
      )

      if (componentList.length === 0) {
        dispatch(
          resetPageConfig({
            title: draft.title,
            description: draft.description,
            footerText: draft.footerText
          })
        )
      }

      setDraftApplied(true)
      clearDraftAfterApply()
      void persistConversationDraftState({
        lastInstruction: null,
        latestDraft: null,
        latestSummary: null
      })
      message.success(
        componentList.length === 0 ? 'AI 生成的问卷已应用到编辑器' : 'AI 生成的组件已插入当前问卷'
      )
    },
    [
      clearDraftAfterApply,
      componentList.length,
      dispatch,
      message,
      persistConversationDraftState,
      selectedId,
      version
    ]
  )

  const doApplyEditDraft = useCallback(
    (draft: QuestionnaireDraft) => {
      const normalizedComponents = normalizeQuestionnaireComponentList(draft.components)
      const nextSelectedId =
        normalizedComponents.find(component => component.fe_id === selectedId)?.fe_id ||
        normalizedComponents[0]?.fe_id ||
        ''

      dispatch(
        resetComponents({
          selectedId: nextSelectedId,
          componentList: normalizedComponents,
          version
        })
      )

      dispatch(
        resetPageConfig({
          title: draft.title,
          description: draft.description,
          footerText: draft.footerText
        })
      )

      setDraftApplied(true)
      clearDraftAfterApply()
      void persistConversationDraftState({
        lastInstruction: null,
        latestDraft: null,
        latestSummary: null
      })
      message.success('AI 草稿已应用到编辑器')
    },
    [clearDraftAfterApply, dispatch, message, persistConversationDraftState, selectedId, version]
  )

  const applyDraft = useCallback(() => {
    if (!finalDraft) {
      message.warning('请先等待 AI 生成最终草稿')
      return
    }

    if (draftApplied) {
      message.info('本轮草稿已经应用过了，如需继续生成请重新发送需求')
      return
    }

    if (mode === 'generate') {
      applyGenerateDraft(finalDraft)
      return
    }

    if (version === baseVersionRef.current) {
      doApplyEditDraft(finalDraft)
      return
    }

    modal.confirm({
      title: '检测到问卷已发生变更',
      content: 'AI 草稿生成期间，你又修改了当前问卷。是否仍然覆盖当前编辑结果？',
      okText: '覆盖应用',
      cancelText: '放弃本次草稿',
      onOk: () => {
        doApplyEditDraft(finalDraft)
      }
    })
  }, [
    applyGenerateDraft,
    doApplyEditDraft,
    draftApplied,
    finalDraft,
    message,
    modal,
    mode,
    version
  ])

  const runDraftStream = useCallback(
    async ({
      requestIntent,
      instruction,
      originalInstruction,
      isRetry = false,
      startStatus,
      assistantPlaceholder,
      appendUserMessage
    }: DraftStreamOptions) => {
      if (!instruction.trim()) return

      if (controllerRef.current) {
        message.warning('当前 AI 会话尚未结束，请先停止后再发送新指令')
        return
      }

      const hasConversation = await ensureActiveConversation(requestIntent)
      if (!hasConversation) return

      const questionnaire = buildQuestionnaireSnapshot()
      const baseHistory = getConversationHistory(messages).filter(item => item.content.trim())
      const processScenario = resolveProcessScenario(requestIntent)
      let attempt = 0
      const maxAttempts = 2
      let successOrHandled = false

      while (attempt < maxAttempts && !successOrHandled) {
        attempt++
        const shouldReuseAssistant = isRetry || attempt > 1 || !appendUserMessage
        const controller = new AbortController()
        controllerRef.current = controller
        baseVersionRef.current = version
        generateDraftBaseRef.current =
          requestIntent === 'generate' ? buildQuestionnaireSnapshot() : null

        resetBufferedUiUpdates()
        setStatus(startStatus)
        setErrorMessage(null)
        setDraftPartial(
          finalDraftRef.current && !draftAppliedRef.current ? finalDraftRef.current : null
        )
        setFinalDraft(null)
        setSummary(null)
        setRequestId(null)
        setWarningMessage(null)
        rawReplyTextRef.current = ''
        setDraftApplied(false)

        if (!shouldReuseAssistant) {
          setMessages(prev =>
            restartProcessMessage(
              [
                ...prev,
                { role: 'user', kind: 'chat', content: instruction },
                { role: 'assistant', kind: 'chat', content: '' }
              ],
              processScenario,
              startStatus
            )
          )
        } else {
          setMessages(prev =>
            restartProcessMessage(
              replaceLastAssistantMessage(prev, assistantPlaceholder),
              processScenario,
              startStatus
            )
          )
        }

        const requestBody: AiCopilotStreamRequest = {
          intent: requestIntent,
          questionnaireId: Number(questionnaireId) || 0,
          conversationId: activeConversationIdRef.current || undefined,
          baseVersion: version,
          model: selectedModel || undefined,
          instruction,
          originalInstruction,
          history: baseHistory,
          questionnaire,
          ...(requestIntent === 'generate' ? { generateStage: 'generate' as const } : {})
        }

        let shouldRetry = false

        try {
          await apis.aiApi.copilotStream(requestBody, {
            signal: controller.signal,
            onEvent: event => {
              switch (event.event) {
                case 'meta':
                  setRequestId(event.data.requestId)
                  if (event.data.conversationId) {
                    activeConversationIdRef.current = event.data.conversationId
                    setActiveConversationId(event.data.conversationId)
                    void refreshConversationList(event.data.conversationId)
                  }
                  baseVersionRef.current = event.data.baseVersion
                  setStatus(startStatus)
                  break
                case 'phase':
                  syncRuntimeStatus(
                    event.data.phase === 'polishing' ? 'polishing' : event.data.phase,
                    requestIntent,
                    processScenario,
                    assistantPlaceholder
                  )
                  break
                case 'assistant_delta':
                  rawReplyTextRef.current += event.data.delta
                  break
                case 'tool_call':
                  setMessages(previousMessages =>
                    updateProcessByToolEvent(
                      previousMessages,
                      processScenario,
                      event.data.toolName,
                      'running'
                    )
                  )
                  break
                case 'tool_result':
                  setMessages(previousMessages =>
                    updateProcessByToolEvent(
                      previousMessages,
                      processScenario,
                      event.data.toolName,
                      event.data.status === 'error' ? 'error' : 'done'
                    )
                  )
                  break
                case 'draft_partial': {
                  const normalizedDraft = normalizeDraft(
                    event.data.draft,
                    buildDraftFallback(requestIntent),
                    `${requestIntent}-partial-${event.data.progress.componentsParsed}`
                  )
                  bufferedUiUpdatesRef.current.partialDraft =
                    requestIntent === 'generate'
                      ? buildMergedGenerateDraft(normalizedDraft)
                      : normalizedDraft
                  scheduleBufferedUiFlush()
                  break
                }
                case 'draft': {
                  flushBufferedUiUpdates(true)
                  const normalizedDraft = normalizeDraft(
                    event.data.draft,
                    buildDraftFallback(requestIntent),
                    `${requestIntent}-final`
                  )
                  const nextDraft =
                    requestIntent === 'generate'
                      ? buildMergedGenerateDraft(normalizedDraft)
                      : normalizedDraft
                  const fallbackReply =
                    requestIntent === 'generate'
                      ? '已根据当前输入生成问卷草稿，可在中间预览确认后应用。'
                      : '已生成修改建议，可在中间预览确认后应用。'
                  const nextReply = event.data.reply || rawReplyTextRef.current || fallbackReply
                  const displayReply = formatAssistantBubbleReply(nextReply, fallbackReply)

                  setDraftPartial(nextDraft)
                  setFinalDraft(nextDraft)
                  setSummary(event.data.summary)
                  rawReplyTextRef.current = nextReply
                  setMessages(previousMessages =>
                    finalizeProcessMessage(
                      replaceLastAssistantMessage(previousMessages, displayReply),
                      processScenario,
                      'draft_ready'
                    )
                  )
                  setStatus('draft_ready')
                  setDraftApplied(false)
                  break
                }
                case 'warning':
                  setWarningMessage(event.data.message)
                  break
                case 'done':
                  flushBufferedUiUpdates(true)
                  controllerRef.current = null
                  if (requestIntent === 'generate') {
                    dispatchGenerateFlow({ type: 'complete_generate' })
                  }
                  void refreshConversationList(activeConversationIdRef.current)
                  setStatus(currentStatus =>
                    currentStatus === 'draft_ready' ? 'done' : currentStatus
                  )
                  break
                case 'error':
                  flushBufferedUiUpdates(true)
                  controllerRef.current = null

                  if (
                    event.data.message?.includes('缺少 END_DRAFT 标记') &&
                    !isRetry &&
                    attempt === 1
                  ) {
                    shouldRetry = true
                    return
                  }

                  if (requestIntent === 'generate') {
                    dispatchGenerateFlow({ type: 'fail' })
                  }

                  setErrorMessage(event.data.message)
                  setStatus('error')
                  setMessages(previousMessages =>
                    finalizeProcessMessage(
                      replaceLastAssistantMessage(
                        previousMessages,
                        formatAssistantBubbleReply(
                          rawReplyTextRef.current,
                          requestIntent === 'generate'
                            ? 'AI 在问卷生成阶段未能产出可用草稿，请调整 Prompt 后重试。'
                            : 'AI 未能生成可用草稿，请调整指令后重试。'
                        )
                      ),
                      processScenario,
                      'error'
                    )
                  )
                  message.error(event.data.message)
                  break
                default:
                  break
              }
            }
          })
        } catch (error: any) {
          if (controller.signal.aborted) {
            flushBufferedUiUpdates(true)
            if (requestIntent === 'generate') {
              dispatchGenerateFlow({ type: 'cancel' })
            }
            setStatus(currentStatus =>
              currentStatus === 'draft_ready' ? currentStatus : 'cancelled'
            )
          } else {
            flushBufferedUiUpdates(true)
            if (requestIntent === 'generate') {
              dispatchGenerateFlow({ type: 'fail' })
            }
            const nextMessage = error?.message || 'AI 工作台请求失败，请稍后重试'
            setErrorMessage(nextMessage)
            setStatus('error')
            setMessages(previousMessages =>
              finalizeProcessMessage(previousMessages, processScenario, 'error')
            )
            message.error(nextMessage)
          }
        } finally {
          if (controllerRef.current === controller) {
            controllerRef.current = null
          }
          if (requestIntent === 'generate') {
            generateDraftBaseRef.current = null
          }
        }

        if (shouldRetry) {
          message.info('AI 生成不完整，正在自动重试...')
          successOrHandled = false
        } else {
          successOrHandled = true
        }
      }
    },
    [
      buildQuestionnaireSnapshot,
      buildDraftFallback,
      ensureActiveConversation,
      flushBufferedUiUpdates,
      message,
      messages,
      questionnaireId,
      refreshConversationList,
      scheduleBufferedUiFlush,
      selectedModel,
      syncRuntimeStatus,
      version
    ]
  )

  const runPromptPolishStream = useCallback(
    async (instruction: string, isRetry = false) => {
      if (!instruction.trim()) return

      if (controllerRef.current) {
        message.warning('当前 AI 会话尚未结束，请先停止后再发送新指令')
        return
      }

      const hasConversation = await ensureActiveConversation('generate')
      if (!hasConversation) return

      const questionnaire = buildQuestionnaireSnapshot()
      const baseHistory = getConversationHistory(messages).filter(item => item.content.trim())
      const processScenario: AiProcessScenario = 'polish'
      const controller = new AbortController()
      let hasPromptDelta = false
      controllerRef.current = controller
      baseVersionRef.current = version

      resetBufferedUiUpdates()
      dispatchGenerateFlow({
        type: 'start_polish',
        instruction
      })
      setStatus('polishing')
      setErrorMessage(null)
      setWarningMessage(null)
      setRequestId(null)
      setDraftApplied(false)
      rawReplyTextRef.current = ''

      if (!isRetry) {
        setMessages(prev =>
          restartProcessMessage(
            [
              ...prev,
              { role: 'user', kind: 'chat', content: `润色：${instruction}` },
              { role: 'assistant', kind: 'chat', content: '' }
            ],
            processScenario,
            'polishing'
          )
        )
      } else {
        setMessages(prev =>
          restartProcessMessage(
            replaceLastAssistantMessage(prev, '正在重新润色需求...'),
            processScenario,
            'polishing'
          )
        )
      }

      const requestBody: AiCopilotStreamRequest = {
        intent: 'generate',
        generateStage: 'polish',
        questionnaireId: Number(questionnaireId) || 0,
        conversationId: activeConversationIdRef.current || undefined,
        baseVersion: version,
        model: selectedModel || undefined,
        instruction,
        originalInstruction: instruction,
        history: baseHistory,
        questionnaire
      }

      try {
        await apis.aiApi.copilotStream(requestBody, {
          signal: controller.signal,
          onEvent: event => {
            switch (event.event) {
              case 'meta':
                setRequestId(event.data.requestId)
                if (event.data.conversationId) {
                  activeConversationIdRef.current = event.data.conversationId
                  setActiveConversationId(event.data.conversationId)
                  void refreshConversationList(event.data.conversationId)
                }
                baseVersionRef.current = event.data.baseVersion
                setStatus('polishing')
                break
              case 'phase':
                syncRuntimeStatus(
                  event.data.phase === 'polishing' ? 'polishing' : event.data.phase,
                  'generate',
                  processScenario,
                  '正在润色需求...'
                )
                break
              case 'prompt_delta':
                if (!hasPromptDelta) {
                  bufferedUiUpdatesRef.current.replacePrompt = true
                  hasPromptDelta = true
                }
                bufferedUiUpdatesRef.current.promptDelta += event.data.delta
                scheduleBufferedUiFlush()
                break
              case 'tool_call':
                setMessages(previousMessages =>
                  updateProcessByToolEvent(
                    previousMessages,
                    processScenario,
                    event.data.toolName,
                    'running'
                  )
                )
                break
              case 'tool_result':
                setMessages(previousMessages =>
                  updateProcessByToolEvent(
                    previousMessages,
                    processScenario,
                    event.data.toolName,
                    event.data.status === 'error' ? 'error' : 'done'
                  )
                )
                break
              case 'prompt_refined': {
                flushBufferedUiUpdates(true)
                const nextPrompt =
                  event.data.prompt.trim() || generateFlowRef.current.refinedInstruction.trim()
                setComposerInputState(nextPrompt)
                dispatchGenerateFlow({
                  type: 'finish_polish',
                  prompt: nextPrompt
                })
                setMessages(previousMessages =>
                  finalizeProcessMessage(
                    replaceLastAssistantMessage(
                      previousMessages,
                      event.data.reply || 'Prompt 润色完成，已回填到输入框，可继续编辑或直接发送。'
                    ),
                    processScenario,
                    'done'
                  )
                )
                setStatus('awaiting_confirmation')
                break
              }
              case 'warning':
                setWarningMessage(event.data.message)
                break
              case 'done':
                flushBufferedUiUpdates(true)
                controllerRef.current = null
                void refreshConversationList(activeConversationIdRef.current)
                setStatus(currentStatus =>
                  currentStatus === 'polishing' ? 'awaiting_confirmation' : currentStatus
                )
                break
              case 'error':
                flushBufferedUiUpdates(true)
                controllerRef.current = null
                dispatchGenerateFlow({ type: 'fail' })
                setErrorMessage(event.data.message)
                setStatus('error')
                setMessages(previousMessages =>
                  finalizeProcessMessage(
                    replaceLastAssistantMessage(previousMessages, 'Prompt 润色失败，请重试。'),
                    processScenario,
                    'error'
                  )
                )
                message.error(event.data.message)
                break
              default:
                break
            }
          }
        })
      } catch (error: any) {
        if (controller.signal.aborted) {
          flushBufferedUiUpdates(true)
          dispatchGenerateFlow({ type: 'cancel' })
          setStatus('cancelled')
        } else {
          flushBufferedUiUpdates(true)
          dispatchGenerateFlow({ type: 'fail' })
          const nextMessage = error?.message || 'Prompt 润色请求失败，请稍后重试'
          setErrorMessage(nextMessage)
          setStatus('error')
          setMessages(previousMessages =>
            finalizeProcessMessage(previousMessages, processScenario, 'error')
          )
          message.error(nextMessage)
        }
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null
        }
      }
    },
    [
      buildQuestionnaireSnapshot,
      ensureActiveConversation,
      flushBufferedUiUpdates,
      message,
      messages,
      questionnaireId,
      refreshConversationList,
      scheduleBufferedUiFlush,
      selectedModel,
      syncRuntimeStatus,
      version
    ]
  )

  const executeSendInstruction = useCallback(
    async (requestIntent: AiCopilotIntent, instruction: string) => {
      if (!instruction.trim()) return

      const hasConversation = await ensureActiveConversation(requestIntent)
      if (!hasConversation) return

      if (requestIntent === 'generate') {
        const prompt = instruction.trim()

        dispatchGenerateFlow({
          type: 'edit_refined_prompt',
          prompt
        })
        dispatchGenerateFlow({
          type: 'start_generate',
          prompt,
          sourceInstruction: generateFlowRef.current.sourceInstruction || prompt
        })

        await runDraftStream({
          requestIntent: 'generate',
          instruction: prompt,
          originalInstruction: generateFlowRef.current.sourceInstruction || prompt,
          startStatus: 'connecting',
          assistantPlaceholder: '正在连接 AI 并准备生成问卷...',
          appendUserMessage: true
        })
        return
      }

      setComposerInputState('')
      await runDraftStream({
        requestIntent: 'edit',
        instruction,
        startStatus: 'connecting',
        assistantPlaceholder: '正在连接 AI 并读取当前问卷...',
        appendUserMessage: true
      })
    },
    [ensureActiveConversation, runDraftStream]
  )

  const closePendingDraftDecision = useCallback(() => {
    pendingDraftInstructionRef.current = ''
    setIsPendingDraftDecisionOpen(false)
  }, [])

  const appendPendingDraft = useCallback(async () => {
    const nextInstruction = pendingDraftInstructionRef.current.trim()
    closePendingDraftDecision()
    if (!nextInstruction) return

    setModeState('generate')
    await executeSendInstruction('generate', nextInstruction)
  }, [closePendingDraftDecision, executeSendInstruction])

  const regeneratePendingDraft = useCallback(async () => {
    const nextInstruction = pendingDraftInstructionRef.current.trim()
    closePendingDraftDecision()
    if (!nextInstruction) return

    clearPendingDraftState()
    void persistConversationDraftState({
      lastInstruction: nextInstruction,
      latestDraft: null,
      latestSummary: null
    })
    setModeState('generate')
    dispatchGenerateFlow({
      type: 'edit_refined_prompt',
      prompt: nextInstruction
    })
    await executeSendInstruction('generate', nextInstruction)
  }, [
    clearPendingDraftState,
    closePendingDraftDecision,
    executeSendInstruction,
    persistConversationDraftState
  ])

  const sendInstruction = useCallback(
    async (instruction: string) => {
      const nextInstruction = instruction.trim()
      if (!nextInstruction) return

      if (
        shouldConfirmDraftRegenerate({
          mode,
          hasPendingDraft: Boolean(finalDraftRef.current && !draftAppliedRef.current)
        })
      ) {
        pendingDraftInstructionRef.current = nextInstruction
        setIsPendingDraftDecisionOpen(true)
        return
      }

      await executeSendInstruction(mode, nextInstruction)
    },
    [executeSendInstruction, mode]
  )

  const polishInstruction = useCallback(
    async (instruction?: string) => {
      const nextInstruction = (instruction ?? composerInput).trim()
      if (!nextInstruction) {
        message.warning('请先输入需求后再润色')
        return
      }

      await runPromptPolishStream(nextInstruction)
    },
    [composerInput, message, runPromptPolishStream]
  )

  const retryPromptPolish = useCallback(async () => {
    const nextInstruction =
      composerInput.trim() || generateFlowRef.current.refinedInstruction.trim()
    if (!nextInstruction) {
      message.warning('当前没有可继续润色的内容')
      return
    }

    await runPromptPolishStream(nextInstruction, true)
  }, [composerInput, message, runPromptPolishStream])

  const retryGenerate = useCallback(async () => {
    const prompt = composerInput.trim()
    if (!prompt) {
      message.warning('当前没有可用于重新生成的内容')
      return
    }

    dispatchGenerateFlow({
      type: 'edit_refined_prompt',
      prompt
    })
    dispatchGenerateFlow({
      type: 'start_generate',
      prompt,
      sourceInstruction: generateFlowRef.current.sourceInstruction || prompt
    })

    await runDraftStream({
      requestIntent: 'generate',
      instruction: prompt,
      originalInstruction: generateFlowRef.current.sourceInstruction || prompt,
      isRetry: true,
      startStatus: 'connecting',
      assistantPlaceholder: '正在连接 AI 并准备生成问卷...',
      appendUserMessage: false
    })
  }, [composerInput, message, runDraftStream])

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
