import { useCallback, useEffect, useRef } from 'react'
import apis from '@/apis'
import {
  AiConversationDetail,
  AiLocalConnectionState,
  AiLocalInterruptedStreamKind,
  AiStreamStatus,
  QuestionnaireDraft
} from '../../components/aiCopilotTypes'
import { DraftStreamOptions } from './aiShared'

type MessageApi = {
  info: (content: string) => void
  warning: (content: string) => void
  error: (content: string) => void
}

type UseAiInterruptedRunRecoveryParams = {
  status: AiStreamStatus
  version: number
  selectedModel: string
  message: MessageApi
  controllerRef: { current: AbortController | null }
  streamAbortReasonRef: { current: 'user' | 'offline' | null }
  activeStreamKindRef: { current: AiLocalInterruptedStreamKind | null }
  activeConversationIdRef: { current: number | null }
  localConnectionState: AiLocalConnectionState
  localInterruptedStreamKind: AiLocalInterruptedStreamKind | null
  setIsBrowserOffline: React.Dispatch<React.SetStateAction<boolean>>
  setLocalConnectionState: React.Dispatch<React.SetStateAction<AiLocalConnectionState>>
  resetLocalConnectionState: () => void
  setSelectedModel: (model: string) => void
  setComposerInputState: React.Dispatch<React.SetStateAction<string>>
  loadConversationDetail: (conversationId: number) => Promise<AiConversationDetail | null>
  refreshConversationList: (preferredConversationId?: number | null) => Promise<unknown>
  runDraftStream: (options: DraftStreamOptions) => Promise<void>
}

export const useAiInterruptedRunRecovery = ({
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
  setSelectedModel,
  setComposerInputState,
  loadConversationDetail,
  refreshConversationList,
  runDraftStream
}: UseAiInterruptedRunRecoveryParams) => {
  const backgroundStatusPollRef = useRef<number | null>(null)

  const clearBackgroundStatusPoll = useCallback(() => {
    if (backgroundStatusPollRef.current === null) return
    window.clearTimeout(backgroundStatusPollRef.current)
    backgroundStatusPollRef.current = null
  }, [])

  useEffect(() => {
    return () => {
      clearBackgroundStatusPoll()
    }
  }, [clearBackgroundStatusPoll])

  useEffect(() => {
    if (status === 'background_running') return
    clearBackgroundStatusPoll()
  }, [clearBackgroundStatusPoll, status])

  const refreshBackgroundRunStatus = useCallback(
    async (shouldPoll = true) => {
      const conversationId = activeConversationIdRef.current
      if (!conversationId) return false

      clearBackgroundStatusPoll()

      const startedAt = Date.now()
      const pollUntilSettled = async (): Promise<boolean> => {
        const detail = await loadConversationDetail(conversationId)
        if (!detail) return false

        await refreshConversationList(conversationId)

        if (detail.lastRuntimeStatus !== 'background_running') {
          return true
        }

        if (!shouldPoll || Date.now() - startedAt >= 45_000) {
          return false
        }

        return await new Promise<boolean>(resolve => {
          backgroundStatusPollRef.current = window.setTimeout(async () => {
            backgroundStatusPollRef.current = null
            resolve(await pollUntilSettled())
          }, 3_000)
        })
      }

      return await pollUntilSettled()
    },
    [
      activeConversationIdRef,
      clearBackgroundStatusPoll,
      loadConversationDetail,
      refreshConversationList
    ]
  )

  useEffect(() => {
    const handleOffline = () => {
      setIsBrowserOffline(true)
      if (!controllerRef.current || !activeStreamKindRef.current) return

      streamAbortReasonRef.current = 'offline'
      controllerRef.current.abort()
    }

    const handleOnline = () => {
      setIsBrowserOffline(false)
      if (localConnectionState !== 'offline_interrupted') return

      if (localInterruptedStreamKind === 'polish') {
        resetLocalConnectionState()
        message.info('网络已恢复，可重新发起润色。')
        return
      }

      setLocalConnectionState('reconnected_refreshing')
      message.info('网络已恢复，正在刷新当前 AI 状态...')
      void refreshBackgroundRunStatus(false).finally(() => {
        resetLocalConnectionState()
      })
    }

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)

    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [
    controllerRef,
    activeStreamKindRef,
    localConnectionState,
    localInterruptedStreamKind,
    message,
    refreshBackgroundRunStatus,
    resetLocalConnectionState,
    setIsBrowserOffline,
    setLocalConnectionState,
    streamAbortReasonRef
  ])

  const stopBackgroundRun = useCallback(async () => {
    const conversationId = activeConversationIdRef.current
    if (!conversationId) return false

    clearBackgroundStatusPoll()
    const response = await apis.aiApi.cancelCopilot({
      conversationId
    })
    if (response.code !== 1) {
      message.error(response.msg || '停止后台生成失败')
      return false
    }

    await loadConversationDetail(conversationId)
    await refreshConversationList(conversationId)
    message.info('已停止后台生成')
    return true
  }, [
    activeConversationIdRef,
    clearBackgroundStatusPoll,
    loadConversationDetail,
    message,
    refreshConversationList
  ])

  const recoverInterruptedRun = useCallback(async () => {
    const conversationId = activeConversationIdRef.current
    if (!conversationId) return false

    clearBackgroundStatusPoll()
    const detail = await loadConversationDetail(conversationId)
    if (!detail) return false

    await refreshConversationList(conversationId)

    if (detail.lastRuntimeStatus === 'background_running') {
      message.info('AI 仍在后台继续生成，先为你刷新状态。')
      void refreshBackgroundRunStatus(true)
      return false
    }

    if (detail.lastRuntimeStatus !== 'resume_available') {
      return true
    }

    const latestBatch =
      detail.latestBatches && detail.latestBatches.length > 0
        ? detail.latestBatches[detail.latestBatches.length - 1]
        : null
    const recoverInstruction = (detail.lastInstruction || '').trim()
    const recoverQuestionnaire =
      latestBatch?.latestBaseQuestionnaire || detail.latestBaseQuestionnaire || null
    const recoverModel = detail.lastModel || selectedModel
    const recoverBaseVersion = latestBatch?.baseVersion ?? version
    const recoverAnchorQuestionId = latestBatch?.anchorQuestionId || ''

    if (!recoverInstruction || !recoverQuestionnaire) {
      message.warning('当前缺少可恢复的上下文，请先放弃本轮后再重新发送。')
      return false
    }
    if (detail.intent === 'edit' && !recoverAnchorQuestionId) {
      message.warning('当前缺少恢复所需的题目定位信息，请先放弃本轮后再重新发送。')
      return false
    }

    setSelectedModel(recoverModel)
    setComposerInputState(detail.lastInstruction || '')

    await runDraftStream({
      requestIntent: detail.intent,
      instruction: recoverInstruction,
      originalInstruction:
        detail.intent === 'generate' ? detail.lastInstruction || recoverInstruction : undefined,
      isRetry: true,
      startStatus: 'connecting',
      assistantPlaceholder:
        detail.intent === 'generate' ? '正在恢复本轮生成...' : '正在恢复本轮修改...',
      appendUserMessage: false,
      overrideQuestionnaire: recoverQuestionnaire as QuestionnaireDraft,
      overrideModel: recoverModel,
      overrideFocusedComponentId:
        detail.intent === 'edit' ? recoverAnchorQuestionId || undefined : undefined,
      overrideBaseVersion: recoverBaseVersion
    })
    return true
  }, [
    activeConversationIdRef,
    clearBackgroundStatusPoll,
    loadConversationDetail,
    message,
    refreshBackgroundRunStatus,
    refreshConversationList,
    runDraftStream,
    selectedModel,
    setComposerInputState,
    setSelectedModel,
    version
  ])

  return {
    refreshBackgroundRunStatus,
    stopBackgroundRun,
    recoverInterruptedRun
  }
}
