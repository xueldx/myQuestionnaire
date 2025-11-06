import request from '@/utils/request'
import streamRequest from '@/utils/streamRequest'
import { RespType } from '@/apis/modules/types/common'
import {
  AiConversationDetail,
  AiConversationSummary,
  AiCopilotStreamEvent,
  AiCopilotStreamRequest
} from '@/pages/question/Edit/components/aiCopilotTypes'
const prefix = '/api/ai'

type LegacyTextStreamHandle = {
  eventSource: null
  onMessage: (callback: (data: string) => void) => void
  onError: (callback: (error: any) => void) => void
  close: () => void
}

const createLegacyTextStream = (url: string): LegacyTextStreamHandle => {
  const controller = new AbortController()
  let messageHandler: ((data: string) => void) | null = null
  let errorHandler: ((error: any) => void) | null = null
  const pendingMessages: string[] = []
  const pendingErrors: any[] = []

  const emitMessage = (data: string) => {
    if (messageHandler) {
      messageHandler(data)
      return
    }

    pendingMessages.push(data)
  }

  const emitError = (error: any) => {
    if (errorHandler) {
      errorHandler(error)
      return
    }

    pendingErrors.push(error)
  }

  void streamRequest<string>({
    url,
    method: 'GET',
    signal: controller.signal,
    onEvent: frame => {
      if (frame.event !== 'message') return

      const payload =
        typeof frame.data === 'string'
          ? frame.data
          : frame.data == null
          ? ''
          : JSON.stringify(frame.data)

      emitMessage(payload)
    }
  }).catch(error => {
    if (controller.signal.aborted) return
    emitError(error)
  })

  return {
    eventSource: null,
    onMessage: callback => {
      messageHandler = callback
      pendingMessages.splice(0).forEach(callback)
    },
    onError: callback => {
      errorHandler = callback
      pendingErrors.splice(0).forEach(callback)
    },
    close: () => {
      controller.abort()
    }
  }
}

const mapCopilotStreamEvent = (
  event: string,
  data: AiCopilotStreamEvent['data'] | string | null
) => {
  if (data == null || typeof data === 'string') {
    throw new Error(`AI 流事件 ${event} 数据格式异常`)
  }

  return {
    event,
    data
  } as AiCopilotStreamEvent
}

// 获取可用的AI模型列表
const getModelList = async () => request.get<any, RespType<any>>(`${prefix}/models`)

const getConversationList = async (questionnaireId: number) =>
  request.get<any, RespType<AiConversationSummary[]>>(
    `${prefix}/conversations?questionnaireId=${questionnaireId}`
  )

const createConversation = async (payload: {
  questionnaireId: number
  intent?: 'generate' | 'edit'
  title?: string
}) => request.post<any, RespType<AiConversationDetail>>(`${prefix}/conversations`, payload)

const getConversationDetail = async (conversationId: number) =>
  request.get<any, RespType<AiConversationDetail>>(`${prefix}/conversations/${conversationId}`)

const updateConversation = async (
  conversationId: number,
  payload: {
    title?: string
    isPinned?: boolean
    intent?: 'generate' | 'edit'
    lastInstruction?: string | null
    latestDraft?: AiConversationDetail['latestDraft']
    latestSummary?: AiConversationDetail['latestSummary']
  }
) =>
  request.patch<any, RespType<AiConversationSummary>>(
    `${prefix}/conversations/${conversationId}`,
    payload
  )

const deleteConversation = async (conversationId: number) =>
  request.delete<any, RespType<null>>(`${prefix}/conversations/${conversationId}`)

// 生成问卷，支持模型选择和题目数量
const generateQuestionnaire = (theme: string, count = 10, model?: string) => {
  let url = `${prefix}/generate?theme=${theme}&count=${count}`
  if (model) {
    url += `&model=${model}`
  }

  return createLegacyTextStream(url)
}

// 分析问卷，支持模型选择
const analyzeQuestionnaire = (questionnaireId: string, model?: string) => {
  let url = `${prefix}/analysis?questionnaire_id=${questionnaireId}`
  if (model) {
    url += `&model=${model}`
  }

  return createLegacyTextStream(url)
}

const copilotStream = (
  payload: AiCopilotStreamRequest,
  options: {
    signal?: AbortSignal
    onEvent: (event: AiCopilotStreamEvent) => void
  }
) => {
  return streamRequest<AiCopilotStreamEvent['data']>({
    url: `${prefix}/copilot/stream`,
    body: payload,
    signal: options.signal,
    onEvent: frame => {
      options.onEvent(mapCopilotStreamEvent(frame.event, frame.data))
    }
  })
}

export default {
  getModelList,
  getConversationList,
  createConversation,
  getConversationDetail,
  updateConversation,
  deleteConversation,
  generateQuestionnaire,
  analyzeQuestionnaire,
  copilotStream
}
