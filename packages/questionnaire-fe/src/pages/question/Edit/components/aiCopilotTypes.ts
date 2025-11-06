import { ComponentInfoType } from '@/store/modules/componentsSlice'

export type AiCopilotIntent = 'generate' | 'edit'
export type AiGenerateStage = 'polish' | 'generate'
export type AiWorkflowStage = AiGenerateStage | 'edit'
export type AiRuntimePhase = 'polishing' | 'thinking' | 'answering' | 'drafting'
export type AiChatMessageRole = 'user' | 'assistant' | 'tool' | 'process'
export type AiChatMessageKind = 'chat' | 'tool_call' | 'tool_result' | 'process'
export type AiProcessStepStatus = 'pending' | 'running' | 'done' | 'error'
export type AiProcessScenario = AiCopilotIntent | 'polish'

export type AiProcessStep = {
  id: string
  label: string
  status: AiProcessStepStatus
  summary?: string
}

export type AiProcessMessageMeta = {
  collapsed: boolean
  summary: string
  steps: AiProcessStep[]
}

export type AiChatMessage = {
  id?: number | string
  role: AiChatMessageRole
  kind?: AiChatMessageKind
  content: string
  toolName?: string | null
  metadata?: Record<string, any> | AiProcessMessageMeta | null
  createdAt?: string
}

export type QuestionnaireDraft = {
  title: string
  description: string
  footerText: string
  components: ComponentInfoType[]
}

export type DraftSummary = {
  added: string[]
  updated: string[]
  deleted: string[]
}

export type QuestionnaireSnapshot = {
  title: string
  description: string
  footerText: string
  components: ComponentInfoType[]
}

export type AiCopilotStreamRequest = {
  intent: AiCopilotIntent
  questionnaireId: number
  conversationId?: number
  baseVersion: number
  model?: string
  instruction: string
  generateStage?: AiGenerateStage
  originalInstruction?: string
  history: AiChatMessage[]
  questionnaire: QuestionnaireSnapshot
}

export type AiConversationSummary = {
  id: number
  questionnaireId: number
  title: string
  intent: AiCopilotIntent
  isPinned: boolean
  lastModel: string | null
  lastInstruction: string | null
  messageCount: number
  latestActivityAt: string | null
  updatedAt: string
}

export type AiConversationDetail = AiConversationSummary & {
  latestDraft: QuestionnaireDraft | null
  latestSummary: DraftSummary | null
  messages: AiChatMessage[]
}

export type AiCopilotStreamEvent =
  | {
      event: 'meta'
      data: {
        requestId: string
        conversationId: number
        intent: AiCopilotIntent
        baseVersion: number
        stage: AiWorkflowStage
        timeoutMs: number
      }
    }
  | {
      event: 'phase'
      data: {
        phase: AiRuntimePhase
        stage: AiWorkflowStage
      }
    }
  | {
      event: 'prompt_delta'
      data: {
        delta: string
      }
    }
  | {
      event: 'prompt_refined'
      data: {
        prompt: string
        reply: string
      }
    }
  | {
      event: 'assistant_delta'
      data: {
        delta: string
      }
    }
  | {
      event: 'tool_call'
      data: {
        callId: string
        toolName: string
        summary: string
      }
    }
  | {
      event: 'tool_result'
      data: {
        callId: string
        toolName: string
        status: 'success' | 'error'
        summary: string
        preview?: string
      }
    }
  | {
      event: 'draft_partial'
      data: {
        draft: QuestionnaireDraft
        progress: {
          componentsParsed: number
        }
      }
    }
  | {
      event: 'draft'
      data: {
        reply: string
        draft: QuestionnaireDraft
        summary: DraftSummary
      }
    }
  | {
      event: 'warning'
      data: {
        code?: string
        message: string
      }
    }
  | {
      event: 'done'
      data: {
        ok: true
        stage: AiWorkflowStage
      }
    }
  | {
      event: 'error'
      data: {
        code?: string
        message: string
        stage?: AiWorkflowStage
        retryable?: boolean
      }
    }

export type AiStreamStatus =
  | 'idle'
  | 'connecting'
  | 'polishing'
  | 'awaiting_confirmation'
  | 'thinking'
  | 'answering'
  | 'drafting'
  | 'draft_ready'
  | 'done'
  | 'cancelled'
  | 'error'

export type AiGenerateFlowPhase =
  | 'idle'
  | 'polishing'
  | 'awaiting_confirmation'
  | 'connecting'
  | 'thinking'
  | 'answering'
  | 'drafting'
  | 'completed'
  | 'cancelled'
  | 'error'

export type AiGenerateFlowState = {
  phase: AiGenerateFlowPhase
  sourceInstruction: string
  refinedInstruction: string
  confirmedInstruction: string
  activeStage: AiGenerateStage | null
}

export type AiModelOption = {
  value: string
  label: string
  description?: string
}
