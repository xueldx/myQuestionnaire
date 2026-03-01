import {
  resolveHydratedConversationDetail,
  resolveHydratedConversationInstruction,
  resolvePreferredAiModel
} from '@/pages/question/Edit/hooks/ai/useAiWorkbenchPersistence'

const modelList = [
  {
    value: 'modelscope-qwen3-235b',
    label: 'Qwen3',
    description: 'Qwen3'
  },
  {
    value: 'modelscope-glm-5',
    label: 'GLM5',
    description: 'GLM5'
  }
] as any

describe('useAiWorkbenchPersistence helpers', () => {
  it('prefers the restored unsent composer input only when conversation id matches', () => {
    expect(
      resolveHydratedConversationInstruction(
        {
          id: 22,
          lastInstruction: '服务端指令'
        } as any,
        {
          questionnaireId: '12',
          activeConversationId: 22,
          composerInput: '本地未发送指令'
        } as any
      )
    ).toBe('本地未发送指令')

    expect(
      resolveHydratedConversationInstruction(
        {
          id: 11,
          lastInstruction: '服务端指令'
        } as any,
        {
          questionnaireId: '12',
          activeConversationId: 22,
          composerInput: '本地未发送指令'
        } as any
      )
    ).toBe('服务端指令')
  })

  it('keeps the restored model over the conversation model', () => {
    expect(
      resolvePreferredAiModel({
        availableModels: modelList,
        currentModel: '',
        restoredModel: 'modelscope-glm-5',
        conversationModel: 'modelscope-qwen3-235b',
        source: 'default'
      })
    ).toEqual({
      model: 'modelscope-glm-5',
      source: 'restored'
    })
  })

  it('falls back to the conversation model and then the default model', () => {
    expect(
      resolvePreferredAiModel({
        availableModels: modelList,
        currentModel: '',
        restoredModel: 'unknown-model',
        conversationModel: 'modelscope-qwen3-235b',
        source: 'default'
      })
    ).toEqual({
      model: 'modelscope-qwen3-235b',
      source: 'conversation'
    })

    expect(
      resolvePreferredAiModel({
        availableModels: modelList,
        currentModel: '',
        restoredModel: 'unknown-model',
        conversationModel: 'another-unknown-model',
        source: 'default'
      })
    ).toEqual({
      model: 'modelscope-qwen3-235b',
      source: 'default'
    })
  })

  it('downgrades interrupted polish recovery into a non-recoverable awaiting state', () => {
    expect(
      resolveHydratedConversationDetail({
        detail: {
          id: 22,
          messages: [{ role: 'assistant', content: '正在润色...' }],
          lastInstruction: '服务端润色结果',
          lastRuntimeStatus: 'resume_available',
          lastWorkflowStage: 'polish'
        } as any,
        restoredSessionSnapshot: {
          questionnaireId: '12',
          activeConversationId: 22,
          composerInput: '本地恢复输入'
        } as any,
        hasPolishInterruptedMarker: true
      })
    ).toEqual(
      expect.objectContaining({
        lastInstruction: '本地恢复输入',
        lastRuntimeStatus: 'awaiting_confirmation',
        lastWorkflowStage: 'polish'
      })
    )
  })
})
