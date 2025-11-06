import {
  AiChatMessage,
  AiCopilotIntent,
  AiGenerateStage,
  AiProcessScenario,
  AiProcessStep,
  AiRuntimePhase,
  AiStreamStatus
} from '@/pages/question/Edit/components/aiCopilotTypes'

const PROCESS_STEP_ORDER: Record<string, number> = {
  connecting: 0,
  snapshot: 10,
  stats: 20,
  constraints: 30,
  polishing: 40,
  thinking: 50,
  answering: 60,
  drafting: 70
}

const isWorkflowStage = (value: unknown): value is AiGenerateStage | AiCopilotIntent =>
  value === 'generate' || value === 'edit' || value === 'polish'

const readMessageStage = (message?: AiChatMessage | null) => {
  if (
    !message?.metadata ||
    typeof message.metadata !== 'object' ||
    Array.isArray(message.metadata)
  ) {
    return null
  }

  const stage = (message.metadata as Record<string, unknown>).stage
  return isWorkflowStage(stage) ? stage : null
}

const isPolishInstructionMessage = (message?: AiChatMessage | null) =>
  message?.role === 'user' &&
  typeof message.content === 'string' &&
  message.content.startsWith('润色：')

export const sortProcessSteps = (steps: AiProcessStep[]) =>
  [...steps].sort(
    (left, right) => (PROCESS_STEP_ORDER[left.id] ?? 999) - (PROCESS_STEP_ORDER[right.id] ?? 999)
  )

export const resolveProcessScenario = (
  intent: AiCopilotIntent,
  generateStage?: AiGenerateStage
): AiProcessScenario => {
  if (intent === 'generate' && generateStage === 'polish') return 'polish'
  return intent
}

export const inferHistoryProcessScenario = ({
  requestIntent,
  previousMessage,
  nextMessage
}: {
  requestIntent: AiCopilotIntent
  previousMessage?: AiChatMessage | null
  nextMessage?: AiChatMessage | null
}): AiProcessScenario => {
  const explicitStage = readMessageStage(nextMessage) || readMessageStage(previousMessage)
  if (explicitStage === 'polish') return 'polish'
  if (explicitStage === 'edit') return 'edit'
  if (isPolishInstructionMessage(previousMessage) || isPolishInstructionMessage(nextMessage)) {
    return 'polish'
  }

  return requestIntent === 'edit' ? 'edit' : 'generate'
}

export const getConnectingProcessStep = (
  scenario: AiProcessScenario
): Pick<AiProcessStep, 'id' | 'label'> => {
  if (scenario === 'edit') {
    return {
      id: 'connecting',
      label: '准备修改问卷'
    }
  }

  if (scenario === 'polish') {
    return {
      id: 'connecting',
      label: '准备润色需求'
    }
  }

  return {
    id: 'connecting',
    label: '准备生成问卷'
  }
}

export const getToolProcessStep = (
  scenario: AiProcessScenario,
  toolName: string
): Pick<AiProcessStep, 'id' | 'label'> | null => {
  if (toolName === 'get_questionnaire_snapshot') {
    return {
      id: 'snapshot',
      label: scenario === 'polish' ? '读取当前问卷背景' : '读取当前问卷'
    }
  }

  if (toolName === 'get_answer_statistics') {
    return {
      id: 'stats',
      label: scenario === 'edit' ? '读取作答统计' : '补充问卷背景'
    }
  }

  if (toolName === 'get_component_catalog') {
    return {
      id: 'constraints',
      label:
        scenario === 'edit'
          ? '检查题型约束'
          : scenario === 'polish'
          ? '提取题型约束'
          : '检查题型约束'
    }
  }

  return null
}

export const getPhaseProcessStep = (
  scenario: AiProcessScenario,
  phase: AiRuntimePhase
): Pick<AiProcessStep, 'id' | 'label'> => {
  if (phase === 'polishing') {
    return {
      id: 'polishing',
      label: scenario === 'polish' ? '润色输入内容' : '整理输入内容'
    }
  }

  if (phase === 'thinking') {
    if (scenario === 'edit') {
      return {
        id: 'thinking',
        label: '分析修改要求'
      }
    }

    if (scenario === 'polish') {
      return {
        id: 'thinking',
        label: '分析原始输入'
      }
    }

    return {
      id: 'thinking',
      label: '分析输入要求'
    }
  }

  if (phase === 'answering') {
    if (scenario === 'edit') {
      return {
        id: 'answering',
        label: '整理修改说明'
      }
    }

    if (scenario === 'polish') {
      return {
        id: 'answering',
        label: '整理润色结果'
      }
    }

    return {
      id: 'answering',
      label: '整理结果说明'
    }
  }

  if (scenario === 'edit') {
    return {
      id: 'drafting',
      label: '生成修改草稿'
    }
  }

  if (scenario === 'polish') {
    return {
      id: 'drafting',
      label: '输出润色结果'
    }
  }

  return {
    id: 'drafting',
    label: '生成问卷草稿'
  }
}

export const getProcessSummary = (scenario: AiProcessScenario, status: AiStreamStatus) => {
  if (scenario === 'polish') {
    if (status === 'polishing') return '正在润色输入内容'
    if (status === 'thinking') return '正在分析原始输入'
    if (status === 'answering') return '正在整理润色结果'
    if (status === 'drafting') return '正在输出润色结果'
    if (status === 'draft_ready' || status === 'done') return '已完成输入润色'
    if (status === 'error') return '润色过程中出现异常'
    return '正在准备润色需求'
  }

  if (scenario === 'edit') {
    if (status === 'thinking') return '正在分析修改要求'
    if (status === 'answering') return '正在整理修改说明'
    if (status === 'drafting') return '正在生成修改草稿'
    if (status === 'draft_ready' || status === 'done') return '已完成修改草稿生成'
    if (status === 'error') return '修改过程中出现异常'
    return '正在准备修改问卷'
  }

  if (status === 'polishing') return '正在整理输入内容'
  if (status === 'thinking') return '正在分析输入要求'
  if (status === 'answering') return '正在整理结果说明'
  if (status === 'drafting') return '正在生成问卷草稿'
  if (status === 'draft_ready' || status === 'done') return '已完成问卷草稿生成'
  if (status === 'error') return '生成过程中出现异常'
  return '正在准备生成问卷'
}

export const getProgressAssistantMessage = (
  scenario: AiProcessScenario,
  nextStatus: AiStreamStatus,
  fallback: string
) => {
  if (scenario === 'polish') {
    if (nextStatus === 'connecting') return '正在连接 AI 并准备润色需求...'
    if (nextStatus === 'polishing') return '正在润色输入内容...'
    if (nextStatus === 'thinking') return '正在分析原始输入...'
    if (nextStatus === 'answering') return '正在整理润色结果...'
    if (nextStatus === 'drafting') return '正在输出润色结果...'
    return fallback
  }

  if (scenario === 'edit') {
    if (nextStatus === 'connecting') return '正在连接 AI 并读取当前问卷...'
    if (nextStatus === 'thinking') return '正在分析修改要求...'
    if (nextStatus === 'answering') return '正在整理修改说明...'
    if (nextStatus === 'drafting') return '正在生成修改草稿...'
    return fallback
  }

  if (nextStatus === 'connecting') return '正在连接 AI 并准备生成问卷...'
  if (nextStatus === 'polishing') return '正在整理输入内容...'
  if (nextStatus === 'thinking') return '正在分析输入要求...'
  if (nextStatus === 'answering') return '正在整理结果说明...'
  if (nextStatus === 'drafting') return '正在生成问卷草稿...'
  return fallback
}
