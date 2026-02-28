import { useCallback } from 'react'
import apis from '@/apis'
import {
  AiChatMessage,
  AiGenerateFlowState,
  AiLocalConnectionState,
  AiLocalInterruptedStreamKind,
  AiProcessScenario,
  AiStreamStatus,
  QuestionnaireDraft
} from '../../components/aiCopilotTypes'
import {
  cancelProcessMessage,
  finalizeProcessMessage,
  interruptProcessMessage,
  replaceLastAssistantMessage,
  replaceLastAssistantMessageWithSanitizedContent,
  restartProcessMessage,
  updateProcessByToolEvent
} from './aiProcessState'
import { BufferedUiUpdates, getConversationHistory } from './aiShared'

type MessageApi = {
  warning: (content: string) => void
  error: (content: string) => void
}

type UseAiPromptPolishStreamParams = {
  questionnaireId: string
  selectedModel: string
  version: number
  messages: AiChatMessage[]
  message: MessageApi
  controllerRef: { current: AbortController | null }
  streamAbortReasonRef: { current: 'user' | 'offline' | null }
  activeStreamKindRef: { current: AiLocalInterruptedStreamKind | null }
  activeConversationIdRef: { current: number | null }
  baseVersionRef: { current: number }
  rawReplyTextRef: { current: string }
  generateFlowRef: { current: AiGenerateFlowState }
  bufferedUiUpdatesRef: { current: BufferedUiUpdates }
  setActiveConversationId: (value: number | null) => void
  setStatus: React.Dispatch<React.SetStateAction<AiStreamStatus>>
  setMessages: React.Dispatch<React.SetStateAction<AiChatMessage[]>>
  setErrorMessage: React.Dispatch<React.SetStateAction<string | null>>
  setLocalConnectionState: React.Dispatch<React.SetStateAction<AiLocalConnectionState>>
  setLocalInterruptedStreamKind: React.Dispatch<
    React.SetStateAction<AiLocalInterruptedStreamKind | null>
  >
  setWarningMessage: React.Dispatch<React.SetStateAction<string | null>>
  setRequestId: React.Dispatch<React.SetStateAction<string | null>>
  setDraftApplied: React.Dispatch<React.SetStateAction<boolean>>
  setComposerInputState: React.Dispatch<React.SetStateAction<string>>
  dispatchGenerateFlow: (action: any) => void
  ensureActiveConversation: (intent: 'generate') => Promise<boolean>
  buildQuestionnaireSnapshot: () => QuestionnaireDraft
  refreshConversationList: (preferredConversationId?: number | null) => Promise<unknown>
  scheduleBufferedUiFlush: () => void
  flushBufferedUiUpdates: (immediate?: boolean) => void
  resetBufferedUiUpdates: () => void
  syncRuntimeStatus: (
    nextStatus: Extract<
      AiStreamStatus,
      'connecting' | 'polishing' | 'thinking' | 'answering' | 'drafting'
    >,
    requestIntent: 'generate',
    processScenario: AiProcessScenario,
    fallbackMessage: string
  ) => void
}

export const useAiPromptPolishStream = ({
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
  ensureActiveConversation,
  buildQuestionnaireSnapshot,
  refreshConversationList,
  scheduleBufferedUiFlush,
  flushBufferedUiUpdates,
  resetBufferedUiUpdates,
  syncRuntimeStatus
}: UseAiPromptPolishStreamParams) =>
  useCallback(
    async (instruction: string, isRetry = false) => {
      if (!instruction.trim()) return false

      if (controllerRef.current) {
        message.warning('当前 AI 会话尚未结束，请先停止后再发送新指令')
        return false
      }

      const hasConversation = await ensureActiveConversation('generate')
      if (!hasConversation) return false

      const processScenario: AiProcessScenario = 'polish'
      const controller = new AbortController()
      const baseHistory = getConversationHistory(messages).filter(item => item.content.trim())
      const clearLocalConnectionState = () => {
        setLocalConnectionState('idle')
        setLocalInterruptedStreamKind(null)
      }
      let hasPromptDelta = false
      streamAbortReasonRef.current = null
      activeStreamKindRef.current = 'polish'
      controllerRef.current = controller
      baseVersionRef.current = version

      clearLocalConnectionState()
      resetBufferedUiUpdates()
      bufferedUiUpdatesRef.current.preservedPrompt = instruction
      dispatchGenerateFlow({
        type: 'start_polish',
        instruction
      })
      setComposerInputState('')
      setStatus('polishing')
      setErrorMessage(null)
      setWarningMessage(null)
      setRequestId(null)
      setDraftApplied(false)
      rawReplyTextRef.current = ''

      setMessages(prev =>
        !isRetry
          ? restartProcessMessage(
              [
                ...prev,
                { role: 'user', kind: 'chat', content: `润色：${instruction}` },
                { role: 'assistant', kind: 'chat', content: '' }
              ],
              processScenario,
              'polishing'
            )
          : restartProcessMessage(
              replaceLastAssistantMessage(prev, '正在重新润色需求...'),
              processScenario,
              'polishing'
            )
      )

      try {
        await apis.aiApi.copilotStream(
          {
            intent: 'generate',
            generateStage: 'polish',
            questionnaireId: Number(questionnaireId) || 0,
            conversationId: activeConversationIdRef.current || undefined,
            baseVersion: version,
            model: selectedModel || undefined,
            instruction,
            originalInstruction: instruction,
            history: baseHistory,
            questionnaire: buildQuestionnaireSnapshot()
          },
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
                case 'assistant_delta':
                  rawReplyTextRef.current += event.data.delta
                  setMessages(previousMessages => {
                    const nextReply = rawReplyTextRef.current.trim()
                    if (!nextReply) return previousMessages
                    return replaceLastAssistantMessageWithSanitizedContent(
                      previousMessages,
                      nextReply
                    )
                  })
                  break
                case 'prompt_delta':
                  if (!hasPromptDelta) {
                    bufferedUiUpdatesRef.current.replacePrompt = true
                    bufferedUiUpdatesRef.current.preservedPrompt = ''
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
                  bufferedUiUpdatesRef.current.preservedPrompt = ''
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
                        rawReplyTextRef.current ||
                          event.data.reply ||
                          'Prompt 润色完成，已回填到输入框，可继续编辑或直接发送。'
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
          }
        )
      } catch (error: any) {
        if (controller.signal.aborted) {
          if (streamAbortReasonRef.current === 'offline') {
            const offlineMessage = '网络已断开，当前润色已中止，请联网后重试'
            flushBufferedUiUpdates(true)
            dispatchGenerateFlow({ type: 'fail' })
            setErrorMessage(offlineMessage)
            setWarningMessage(null)
            setStatus('error')
            setLocalConnectionState('offline_interrupted')
            setLocalInterruptedStreamKind('polish')
            setMessages(previousMessages =>
              interruptProcessMessage(
                replaceLastAssistantMessage(previousMessages, `${offlineMessage}。`),
                processScenario,
                '连接已断开，当前润色已中止'
              )
            )
            message.error(offlineMessage)
          } else {
            clearLocalConnectionState()
            flushBufferedUiUpdates(true)
            dispatchGenerateFlow({ type: 'cancel' })
            setMessages(previousMessages => cancelProcessMessage(previousMessages, processScenario))
            setStatus('cancelled')
          }
        } else {
          clearLocalConnectionState()
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
        if (activeStreamKindRef.current === 'polish') {
          activeStreamKindRef.current = null
        }
        streamAbortReasonRef.current = null
      }

      return true
    },
    [
      activeConversationIdRef,
      baseVersionRef,
      buildQuestionnaireSnapshot,
      bufferedUiUpdatesRef,
      controllerRef,
      dispatchGenerateFlow,
      ensureActiveConversation,
      flushBufferedUiUpdates,
      generateFlowRef,
      message,
      messages,
      questionnaireId,
      rawReplyTextRef,
      refreshConversationList,
      resetBufferedUiUpdates,
      scheduleBufferedUiFlush,
      selectedModel,
      setActiveConversationId,
      setComposerInputState,
      setDraftApplied,
      setErrorMessage,
      setLocalConnectionState,
      setLocalInterruptedStreamKind,
      setMessages,
      setRequestId,
      setStatus,
      setWarningMessage,
      streamAbortReasonRef,
      activeStreamKindRef,
      syncRuntimeStatus,
      version
    ]
  )
