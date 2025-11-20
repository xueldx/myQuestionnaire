import { useCallback, useEffect, useRef, useState } from 'react'
import apis from '@/apis'
import {
  AiConversationDetail,
  AiConversationSummary,
  AiCopilotIntent,
  DraftSummary,
  QuestionnaireDraft
} from '../../components/aiCopilotTypes'

type MessageApi = {
  warning: (content: string) => void
  error: (content: string) => void
}

type ModalApi = {
  confirm: (config: {
    title: string
    content: string
    okText?: string
    cancelText?: string
    onOk?: () => void | Promise<void>
  }) => void
}

type UseAiConversationListParams = {
  questionnaireId: string
  message: MessageApi
  modal: ModalApi
  controllerRef: { current: AbortController | null }
  modeRef: { current: AiCopilotIntent }
  finalDraftRef: { current: QuestionnaireDraft | null }
  draftAppliedRef: { current: boolean }
  hydrateConversationDetail: (detail: AiConversationDetail) => void
  resetConversationState: () => void
}

export const useAiConversationList = ({
  questionnaireId,
  message,
  modal,
  controllerRef,
  modeRef,
  finalDraftRef,
  draftAppliedRef,
  hydrateConversationDetail,
  resetConversationState
}: UseAiConversationListParams) => {
  const [conversationList, setConversationList] = useState<AiConversationSummary[]>([])
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null)
  const [conversationLoading, setConversationLoading] = useState(false)
  const [conversationListLoading, setConversationListLoading] = useState(false)
  const activeConversationIdRef = useRef<number | null>(null)
  const createConversationPromiseRef = useRef<Promise<AiConversationDetail | null> | null>(null)
  const refreshConversationListPromiseRef = useRef<Promise<AiConversationSummary[]> | null>(null)

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId
  }, [activeConversationId])

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
        setActiveConversationId(response.data.id)
        activeConversationIdRef.current = response.data.id
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

  const refreshConversationList = useCallback(
    async (
      preferredConversationId?: number | null,
      options?: {
        hydrateDetail?: boolean
      }
    ) => {
      if (refreshConversationListPromiseRef.current) {
        return refreshConversationListPromiseRef.current
      }

      const numericQuestionnaireId = Number(questionnaireId) || 0
      if (!numericQuestionnaireId) return []

      const refreshTask = (async () => {
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
          refreshConversationListPromiseRef.current = null
        }
      })()

      refreshConversationListPromiseRef.current = refreshTask
      return refreshTask
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
          setActiveConversationId(response.data.id)
          activeConversationIdRef.current = response.data.id
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
    [
      controllerRef,
      hydrateConversationDetail,
      message,
      modeRef,
      questionnaireId,
      refreshConversationList
    ]
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
  }, [createConversation, draftAppliedRef, finalDraftRef, modal])

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
    [controllerRef, loadConversationDetail, message, refreshConversationList]
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
    [controllerRef, message, refreshConversationList]
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
          setActiveConversationId(null)
          resetConversationState()
        }
      })
    },
    [
      controllerRef,
      loadConversationDetail,
      message,
      modal,
      refreshConversationList,
      resetConversationState
    ]
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

  useEffect(() => {
    void refreshConversationList(undefined, {
      hydrateDetail: true
    })
  }, [questionnaireId, refreshConversationList])

  return {
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
  }
}
