import { useCallback } from 'react'
import { AiCopilotIntent, AiGenerateFlowState } from '../../components/aiCopilotTypes'
import { DraftStreamOptions } from './aiShared'

type MessageApi = {
  warning: (content: string) => void
}

type UseAiInstructionActionsParams = {
  mode: AiCopilotIntent
  composerInput: string
  selectedId: string
  message: MessageApi
  generateFlowRef: { current: AiGenerateFlowState }
  setComposerInputState: (value: string) => void
  dispatchGenerateFlow: (action: any) => void
  ensureActiveConversation: (intent: AiCopilotIntent) => Promise<boolean>
  runDraftStream: (options: DraftStreamOptions) => Promise<void>
  runPromptPolishStream: (instruction: string, isRetry?: boolean) => Promise<boolean>
}

export const useAiInstructionActions = ({
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
}: UseAiInstructionActionsParams) => {
  const executeSendInstruction = useCallback(
    async (requestIntent: AiCopilotIntent, instruction: string) => {
      if (!instruction.trim()) return false

      const hasConversation = await ensureActiveConversation(requestIntent)
      if (!hasConversation) return false

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

        setComposerInputState('')
        void runDraftStream({
          requestIntent: 'generate',
          instruction: prompt,
          originalInstruction: generateFlowRef.current.sourceInstruction || prompt,
          startStatus: 'connecting',
          assistantPlaceholder: '正在连接 AI 并准备生成问卷...',
          appendUserMessage: true
        })
        return true
      }

      if (!selectedId) {
        message.warning('请先在问卷预览区、编辑器或问卷图层中选中要修改的题目')
        return false
      }

      setComposerInputState('')
      void runDraftStream({
        requestIntent: 'edit',
        instruction,
        startStatus: 'connecting',
        assistantPlaceholder: '正在连接 AI 并读取当前问卷...',
        appendUserMessage: true
      })
      return true
    },
    [
      dispatchGenerateFlow,
      ensureActiveConversation,
      generateFlowRef,
      message,
      runDraftStream,
      selectedId,
      setComposerInputState
    ]
  )

  const sendInstruction = useCallback(
    async (instruction: string) => {
      const nextInstruction = instruction.trim()
      if (!nextInstruction) return false

      return executeSendInstruction(mode, nextInstruction)
    },
    [executeSendInstruction, mode]
  )

  const polishInstruction = useCallback(
    async (instruction?: string) => {
      const nextInstruction = (instruction ?? composerInput).trim()
      if (!nextInstruction) {
        message.warning('请先输入需求后再润色')
        return false
      }

      return runPromptPolishStream(nextInstruction)
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
  }, [composerInput, generateFlowRef, message, runPromptPolishStream])

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
  }, [composerInput, dispatchGenerateFlow, generateFlowRef, message, runDraftStream])

  return {
    executeSendInstruction,
    sendInstruction,
    polishInstruction,
    retryPromptPolish,
    retryGenerate
  }
}
