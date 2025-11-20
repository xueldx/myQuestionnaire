import { useCallback } from 'react'
import {
  AiCopilotIntent,
  AiGenerateFlowState,
  QuestionnaireDraft
} from '../../components/aiCopilotTypes'
import { shouldConfirmDraftRegenerate } from '../aiDraftInteraction'
import { DraftStreamOptions } from './aiShared'

type MessageApi = {
  warning: (content: string) => void
}

type UseAiInstructionActionsParams = {
  mode: AiCopilotIntent
  composerInput: string
  message: MessageApi
  finalDraftRef: { current: QuestionnaireDraft | null }
  draftAppliedRef: { current: boolean }
  generateFlowRef: { current: AiGenerateFlowState }
  pendingDraftInstructionRef: { current: string }
  setModeState: (value: AiCopilotIntent) => void
  setComposerInputState: (value: string) => void
  setIsPendingDraftDecisionOpen: (value: boolean) => void
  dispatchGenerateFlow: (action: any) => void
  clearPendingDraftState: () => void
  closePendingDraftDecision: () => void
  persistConversationDraftState: (payload: {
    lastInstruction?: string | null
    latestDraft?: QuestionnaireDraft | null
    latestSummary?: unknown | null
  }) => Promise<void>
  ensureActiveConversation: (intent: AiCopilotIntent) => Promise<boolean>
  runDraftStream: (options: DraftStreamOptions) => Promise<void>
  runPromptPolishStream: (instruction: string, isRetry?: boolean) => Promise<void>
}

export const useAiInstructionActions = ({
  mode,
  composerInput,
  message,
  finalDraftRef,
  draftAppliedRef,
  generateFlowRef,
  pendingDraftInstructionRef,
  setModeState,
  setComposerInputState,
  setIsPendingDraftDecisionOpen,
  dispatchGenerateFlow,
  clearPendingDraftState,
  closePendingDraftDecision,
  persistConversationDraftState,
  ensureActiveConversation,
  runDraftStream,
  runPromptPolishStream
}: UseAiInstructionActionsParams) => {
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
    [
      dispatchGenerateFlow,
      ensureActiveConversation,
      generateFlowRef,
      runDraftStream,
      setComposerInputState
    ]
  )

  const appendPendingDraft = useCallback(async () => {
    const nextInstruction = pendingDraftInstructionRef.current.trim()
    closePendingDraftDecision()
    if (!nextInstruction) return

    setModeState('generate')
    await executeSendInstruction('generate', nextInstruction)
  }, [closePendingDraftDecision, executeSendInstruction, pendingDraftInstructionRef, setModeState])

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
    dispatchGenerateFlow,
    executeSendInstruction,
    pendingDraftInstructionRef,
    persistConversationDraftState,
    setModeState
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
    [
      draftAppliedRef,
      executeSendInstruction,
      finalDraftRef,
      mode,
      pendingDraftInstructionRef,
      setIsPendingDraftDecisionOpen
    ]
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
    appendPendingDraft,
    regeneratePendingDraft,
    sendInstruction,
    polishInstruction,
    retryPromptPolish,
    retryGenerate
  }
}
