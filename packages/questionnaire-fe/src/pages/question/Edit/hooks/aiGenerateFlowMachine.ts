import {
  AiGenerateFlowPhase,
  AiGenerateFlowState,
  AiGenerateStage,
  AiRuntimePhase
} from '@/pages/question/Edit/components/aiCopilotTypes'

export type AiGenerateFlowAction =
  | {
      type: 'reset'
    }
  | {
      type: 'start_polish'
      instruction: string
    }
  | {
      type: 'append_refined_delta'
      delta: string
    }
  | {
      type: 'finish_polish'
      prompt: string
    }
  | {
      type: 'edit_refined_prompt'
      prompt: string
    }
  | {
      type: 'start_generate'
      prompt: string
      sourceInstruction?: string
    }
  | {
      type: 'sync_runtime_phase'
      phase: Extract<AiGenerateFlowPhase, AiRuntimePhase | 'connecting'>
    }
  | {
      type: 'complete_generate'
    }
  | {
      type: 'cancel'
    }
  | {
      type: 'fail'
    }

export const initialAiGenerateFlowState: AiGenerateFlowState = {
  phase: 'idle',
  sourceInstruction: '',
  refinedInstruction: '',
  confirmedInstruction: '',
  activeStage: null
}

const nextPhaseByStage: Record<AiGenerateStage, AiGenerateFlowPhase> = {
  polish: 'polishing',
  generate: 'connecting'
}

export const aiGenerateFlowReducer = (
  state: AiGenerateFlowState,
  action: AiGenerateFlowAction
): AiGenerateFlowState => {
  switch (action.type) {
    case 'reset':
      return initialAiGenerateFlowState
    case 'start_polish':
      return {
        phase: nextPhaseByStage.polish,
        sourceInstruction: action.instruction,
        refinedInstruction: '',
        confirmedInstruction: '',
        activeStage: 'polish'
      }
    case 'append_refined_delta':
      return {
        ...state,
        phase: nextPhaseByStage.polish,
        activeStage: 'polish',
        refinedInstruction: `${state.refinedInstruction}${action.delta}`
      }
    case 'finish_polish':
      return {
        ...state,
        phase: 'awaiting_confirmation',
        refinedInstruction: action.prompt,
        activeStage: null
      }
    case 'edit_refined_prompt':
      return {
        ...state,
        refinedInstruction: action.prompt
      }
    case 'start_generate':
      return {
        ...state,
        phase: nextPhaseByStage.generate,
        sourceInstruction: action.sourceInstruction ?? state.sourceInstruction,
        confirmedInstruction: action.prompt,
        refinedInstruction: action.prompt,
        activeStage: 'generate'
      }
    case 'sync_runtime_phase':
      return {
        ...state,
        phase: action.phase
      }
    case 'complete_generate':
      return {
        ...state,
        phase: 'completed',
        activeStage: null
      }
    case 'cancel':
      return {
        ...state,
        phase: 'cancelled',
        activeStage: null
      }
    case 'fail':
      return {
        ...state,
        phase: 'error',
        activeStage: null
      }
    default:
      return state
  }
}
