import { useCallback } from 'react'
import apis from '@/apis'
import {
  AiChatMessage,
  AiCopilotIntent,
  AiCopilotStreamRequest,
  AiProcessScenario,
  AiStreamStatus,
  DraftSummary,
  QuestionnaireDraft
} from '../../components/aiCopilotTypes'
import {
  cancelProcessMessage,
  finalizeProcessMessage,
  formatAssistantBubbleReply,
  replaceLastAssistantMessage,
  replaceLastAssistantMessageWithSanitizedContent,
  restartProcessMessage,
  updateProcessByToolEvent
} from './aiProcessState'
import {
  BufferedUiUpdates,
  DraftStreamOptions,
  getConversationHistory,
  normalizeDraft
} from './aiShared'
import { resolveProcessScenario } from '../aiProcessHelpers'

type MessageApi = {
  warning: (content: string) => void
  info: (content: string) => void
  error: (content: string) => void
}

type UseAiDraftStreamParams = {
  questionnaireId: string
  selectedModel: string
  version: number
  messages: AiChatMessage[]
  message: MessageApi
  controllerRef: { current: AbortController | null }
  activeConversationIdRef: { current: number | null }
  baseVersionRef: { current: number }
  finalDraftRef: { current: QuestionnaireDraft | null }
  draftAppliedRef: { current: boolean }
  rawReplyTextRef: { current: string }
  generateDraftBaseRef: { current: QuestionnaireDraft | null }
  bufferedUiUpdatesRef: { current: BufferedUiUpdates }
  setActiveConversationId: (value: number | null) => void
  setStatus: React.Dispatch<React.SetStateAction<AiStreamStatus>>
  setMessages: React.Dispatch<React.SetStateAction<AiChatMessage[]>>
  setErrorMessage: React.Dispatch<React.SetStateAction<string | null>>
  setDraftPartial: React.Dispatch<React.SetStateAction<QuestionnaireDraft | null>>
  setFinalDraft: React.Dispatch<React.SetStateAction<QuestionnaireDraft | null>>
  setSummary: React.Dispatch<React.SetStateAction<DraftSummary | null>>
  setRequestId: React.Dispatch<React.SetStateAction<string | null>>
  setWarningMessage: React.Dispatch<React.SetStateAction<string | null>>
  setDraftApplied: React.Dispatch<React.SetStateAction<boolean>>
  dispatchGenerateFlow: (action: any) => void
  ensureActiveConversation: (intent: AiCopilotIntent) => Promise<boolean>
  buildQuestionnaireSnapshot: () => QuestionnaireDraft
  buildDraftFallback: (intent: AiCopilotIntent) => QuestionnaireDraft
  buildMergedGenerateDraft: (incomingDraft: QuestionnaireDraft) => QuestionnaireDraft
  refreshConversationList: (preferredConversationId?: number | null) => Promise<unknown>
  scheduleBufferedUiFlush: () => void
  flushBufferedUiUpdates: (immediate?: boolean) => void
  resetBufferedUiUpdates: () => void
  syncRuntimeStatus: (
    nextStatus: Extract<
      AiStreamStatus,
      'connecting' | 'polishing' | 'thinking' | 'answering' | 'drafting'
    >,
    requestIntent: AiCopilotIntent,
    processScenario: AiProcessScenario,
    fallbackMessage: string
  ) => void
}

export const useAiDraftStream = ({
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
}: UseAiDraftStreamParams) =>
  useCallback(
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
      let successOrHandled = false

      while (attempt < 2 && !successOrHandled) {
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

        setMessages(prev =>
          !shouldReuseAssistant
            ? restartProcessMessage(
                [
                  ...prev,
                  { role: 'user', kind: 'chat', content: instruction },
                  { role: 'assistant', kind: 'chat', content: '' }
                ],
                processScenario,
                startStatus
              )
            : restartProcessMessage(
                replaceLastAssistantMessage(prev, assistantPlaceholder),
                processScenario,
                startStatus
              )
        )

        let shouldRetry = false

        try {
          await apis.aiApi.copilotStream(
            {
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
            } as AiCopilotStreamRequest,
            {
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
                    setMessages(previousMessages => {
                      const nextReply = formatAssistantBubbleReply(rawReplyTextRef.current, '')
                      if (!nextReply) return previousMessages
                      return replaceLastAssistantMessageWithSanitizedContent(
                        previousMessages,
                        nextReply
                      )
                    })
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

                    setDraftPartial(nextDraft)
                    setFinalDraft(nextDraft)
                    setSummary(event.data.summary)
                    rawReplyTextRef.current = nextReply
                    setMessages(previousMessages =>
                      finalizeProcessMessage(
                        replaceLastAssistantMessage(
                          previousMessages,
                          formatAssistantBubbleReply(nextReply, fallbackReply)
                        ),
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
            }
          )
        } catch (error: any) {
          if (controller.signal.aborted) {
            flushBufferedUiUpdates(true)
            if (requestIntent === 'generate') {
              dispatchGenerateFlow({ type: 'cancel' })
            }
            setMessages(previousMessages => cancelProcessMessage(previousMessages, processScenario))
            setStatus('cancelled')
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
        } else {
          successOrHandled = true
        }
      }
    },
    [
      activeConversationIdRef,
      baseVersionRef,
      buildDraftFallback,
      buildMergedGenerateDraft,
      buildQuestionnaireSnapshot,
      bufferedUiUpdatesRef,
      controllerRef,
      dispatchGenerateFlow,
      draftAppliedRef,
      ensureActiveConversation,
      finalDraftRef,
      flushBufferedUiUpdates,
      generateDraftBaseRef,
      message,
      messages,
      questionnaireId,
      rawReplyTextRef,
      refreshConversationList,
      resetBufferedUiUpdates,
      scheduleBufferedUiFlush,
      selectedModel,
      setActiveConversationId,
      setDraftApplied,
      setDraftPartial,
      setErrorMessage,
      setFinalDraft,
      setMessages,
      setRequestId,
      setStatus,
      setSummary,
      setWarningMessage,
      syncRuntimeStatus,
      version
    ]
  )
