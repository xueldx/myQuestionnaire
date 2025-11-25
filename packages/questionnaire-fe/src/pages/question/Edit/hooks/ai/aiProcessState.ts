import {
  AiChatMessage,
  AiCopilotIntent,
  AiProcessMessageMeta,
  AiProcessScenario,
  AiProcessStep,
  AiProcessStepStatus,
  AiRuntimePhase,
  AiStreamStatus
} from '../../components/aiCopilotTypes'
import {
  getConnectingProcessStep,
  getPhaseProcessStep,
  getProcessStepOrder,
  getProcessSummary,
  getToolProcessStep,
  inferHistoryProcessScenario,
  sortProcessSteps
} from '../aiProcessHelpers'
import { ensurePlainObject } from './aiShared'

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

export const restartProcessMessage = (
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

const getScenarioPhaseSteps = (
  scenario: AiProcessScenario
): Array<Pick<AiProcessStep, 'id' | 'label'>> => {
  if (scenario === 'polish') {
    return [getPhaseProcessStep(scenario, 'polishing')]
  }

  return [
    getPhaseProcessStep(scenario, 'thinking'),
    getPhaseProcessStep(scenario, 'drafting'),
    getPhaseProcessStep(scenario, 'answering')
  ]
}

const setProcessStepStatus = (
  metadata: AiProcessMessageMeta,
  scenario: AiProcessScenario,
  step: Pick<AiProcessStep, 'id' | 'label'>,
  nextStatus: AiProcessStepStatus,
  summary: string
): AiProcessMessageMeta => {
  const nextSteps = metadata.steps.filter(
    item => item.id !== 'connecting' || step.id === 'connecting'
  )
  const existingStepIndex = nextSteps.findIndex(item => item.id === step.id)
  const previousRunningStepIndex = nextSteps.findIndex(item => item.status === 'running')
  const phaseSteps = getScenarioPhaseSteps(scenario)
  const phaseStepIds = new Set(phaseSteps.map(item => item.id))
  const currentStepOrder = getProcessStepOrder(step.id)

  if (previousRunningStepIndex >= 0 && nextSteps[previousRunningStepIndex].id !== step.id) {
    const previousRunningStep = nextSteps[previousRunningStepIndex]
    const previousStepOrder = getProcessStepOrder(previousRunningStep.id)
    nextSteps[previousRunningStepIndex] = {
      ...previousRunningStep,
      status:
        previousRunningStep.status === 'error'
          ? 'error'
          : previousStepOrder > currentStepOrder && phaseStepIds.has(previousRunningStep.id)
          ? 'pending'
          : 'done'
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

  if (nextStatus === 'running' && phaseStepIds.has(step.id)) {
    phaseSteps.forEach(phaseStep => {
      if (getProcessStepOrder(phaseStep.id) <= currentStepOrder) return

      const phaseStepIndex = nextSteps.findIndex(item => item.id === phaseStep.id)
      if (phaseStepIndex >= 0) {
        if (nextSteps[phaseStepIndex].status !== 'running') {
          nextSteps[phaseStepIndex] = {
            ...nextSteps[phaseStepIndex],
            label: phaseStep.label,
            status: 'pending'
          }
        }
        return
      }

      nextSteps.push({
        id: phaseStep.id,
        label: phaseStep.label,
        status: 'pending'
      })
    })
  }

  return {
    ...metadata,
    collapsed: false,
    summary,
    steps: sortProcessSteps(nextSteps)
  }
}

export const updateProcessByStatus = (
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
      setProcessStepStatus(
        metadata,
        scenario,
        step,
        'running',
        getProcessSummary(scenario, status)
      ),
    scenario,
    status
  )
}

export const updateProcessByToolEvent = (
  messages: AiChatMessage[],
  scenario: AiProcessScenario,
  toolName: string,
  stepStatus: AiProcessStepStatus
) => {
  const step = getToolProcessStep(scenario, toolName)
  if (!step) return messages

  return updateProcessMessage(
    messages,
    metadata => setProcessStepStatus(metadata, scenario, step, stepStatus, step.label),
    scenario,
    'thinking'
  )
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

export const finalizeProcessMessage = (
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

export const replaceLastAssistantMessage = (messages: AiChatMessage[], nextContent: string) => {
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

export const replaceLastAssistantMessageWithSanitizedContent = (
  messages: AiChatMessage[],
  nextContent: string
) => {
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

export const sanitizeAssistantReply = (content: string) =>
  content
    .replace(/\r/g, '')
    .replace(/^<<<[A-Z_]+>>>$/gm, '')
    .replace(/^<<<END_[A-Z_]+>>>$/gm, '')
    .replace(/^<<<END_DRAFT>>>$/gm, '')
    .replace(/<<<[A-Z_]*$/g, '')
    .replace(/<<<END_[A-Z_]*$/g, '')
    .replace(/<<<PAGE_[A-Z_]*$/g, '')
    .replace(/<<<COMPONENT[A-Z_>]*$/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

export const formatAssistantBubbleReply = (content: string, fallback: string) => {
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
        scenario,
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

export const normalizeConversationMessages = (
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
