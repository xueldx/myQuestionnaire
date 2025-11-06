import {
  aiGenerateFlowReducer,
  initialAiGenerateFlowState
} from '@/pages/question/Edit/hooks/aiGenerateFlowMachine'

describe('aiGenerateFlowReducer', () => {
  it('tracks the full polish to complete flow', () => {
    let state = aiGenerateFlowReducer(initialAiGenerateFlowState, {
      type: 'start_polish',
      instruction: '生成一份门店服务满意度问卷'
    })

    state = aiGenerateFlowReducer(state, {
      type: 'append_refined_delta',
      delta: '请生成一份面向到店顾客的'
    })
    state = aiGenerateFlowReducer(state, {
      type: 'append_refined_delta',
      delta: '服务满意度问卷'
    })

    expect(state.phase).toBe('polishing')
    expect(state.refinedInstruction).toBe('请生成一份面向到店顾客的服务满意度问卷')

    state = aiGenerateFlowReducer(state, {
      type: 'finish_polish',
      prompt: state.refinedInstruction
    })

    expect(state.phase).toBe('awaiting_confirmation')

    state = aiGenerateFlowReducer(state, {
      type: 'start_generate',
      prompt: state.refinedInstruction
    })

    expect(state.phase).toBe('connecting')
    expect(state.confirmedInstruction).toBe('请生成一份面向到店顾客的服务满意度问卷')

    state = aiGenerateFlowReducer(state, {
      type: 'sync_runtime_phase',
      phase: 'thinking'
    })
    state = aiGenerateFlowReducer(state, {
      type: 'sync_runtime_phase',
      phase: 'drafting'
    })

    expect(state.phase).toBe('drafting')

    state = aiGenerateFlowReducer(state, {
      type: 'complete_generate'
    })

    expect(state.phase).toBe('completed')
    expect(state.activeStage).toBeNull()
  })

  it('keeps the refined prompt when cancelled or failed', () => {
    const awaitingConfirmationState = aiGenerateFlowReducer(
      aiGenerateFlowReducer(initialAiGenerateFlowState, {
        type: 'start_polish',
        instruction: '原始需求'
      }),
      {
        type: 'finish_polish',
        prompt: '润色后的 Prompt'
      }
    )

    const cancelledState = aiGenerateFlowReducer(awaitingConfirmationState, {
      type: 'cancel'
    })
    const failedState = aiGenerateFlowReducer(awaitingConfirmationState, {
      type: 'fail'
    })

    expect(cancelledState.phase).toBe('cancelled')
    expect(cancelledState.refinedInstruction).toBe('润色后的 Prompt')
    expect(failedState.phase).toBe('error')
    expect(failedState.refinedInstruction).toBe('润色后的 Prompt')
  })
})
