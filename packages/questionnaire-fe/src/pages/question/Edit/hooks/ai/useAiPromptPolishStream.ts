import { useCallback } from 'react'
import apis from '@/apis'
import {
  AiChatMessage,
  AiGenerateFlowState,
  AiProcessScenario,
  AiStreamStatus,
  QuestionnaireDraft
} from '../../components/aiCopilotTypes'
import {
  cancelProcessMessage,
  finalizeProcessMessage,
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
  activeConversationIdRef: { current: number | null }
  baseVersionRef: { current: number }
  rawReplyTextRef: { current: string }
  generateFlowRef: { current: AiGenerateFlowState }
  bufferedUiUpdatesRef: { current: BufferedUiUpdates }
  setActiveConversationId: (value: number | null) => void
  setStatus: React.Dispatch<React.SetStateAction<AiStreamStatus>>
  setMessages: React.Dispatch<React.SetStateAction<AiChatMessage[]>>
  setErrorMessage: React.Dispatch<React.SetStateAction<string | null>>
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
      if (!instruction.trim()) return

      if (controllerRef.current) {
        message.warning('当前 AI 会话尚未结束，请先停止后再发送新指令')
        return
      }

      const hasConversation = await ensureActiveConversation('generate')
      if (!hasConversation) return

      const processScenario: AiProcessScenario = 'polish'
      const controller = new AbortController()
      const baseHistory = getConversationHistory(messages).filter(item => item.content.trim())
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
          flushBufferedUiUpdates(true)
          dispatchGenerateFlow({ type: 'cancel' })
          setMessages(previousMessages => cancelProcessMessage(previousMessages, processScenario))
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
      setMessages,
      setRequestId,
      setStatus,
      setWarningMessage,
      syncRuntimeStatus,
      version
    ]
  )
