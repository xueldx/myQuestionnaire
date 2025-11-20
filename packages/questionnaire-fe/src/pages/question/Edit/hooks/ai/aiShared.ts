import { getComponentDefaultProps } from '@/utils/getComponentDefaultProps'
import { normalizeQuestionnaireComponentList } from '@/utils/normalizeQuestionComponent'
import {
  AiChatMessage,
  AiCopilotIntent,
  AiStreamStatus,
  QuestionnaireDraft
} from '../../components/aiCopilotTypes'

export const ensurePlainObject = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

export const normalizeDraft = (
  draft: QuestionnaireDraft,
  fallback: QuestionnaireDraft,
  idPrefix: string
): QuestionnaireDraft => {
  const draftComponents = (draft.components || [])
    .map((component, index) => {
      const defaultInfo = getComponentDefaultProps(component.type)
      if (!defaultInfo) return null

      const title =
        (typeof component.title === 'string' && component.title.trim()) ||
        (typeof ensurePlainObject(component.props).title === 'string'
          ? String(ensurePlainObject(component.props).title)
          : defaultInfo.title)

      const props = {
        ...ensurePlainObject(defaultInfo.props),
        ...ensurePlainObject(component.props),
        title
      }

      return {
        fe_id: component.fe_id || `${idPrefix}-${index + 1}`,
        type: component.type,
        title,
        props
      }
    })
    .filter(Boolean) as QuestionnaireDraft['components']
  const normalizedComponents = normalizeQuestionnaireComponentList(draftComponents)

  return {
    title: draft.title || fallback.title,
    description: draft.description || fallback.description,
    footerText: draft.footerText || fallback.footerText,
    components: normalizedComponents
  }
}

export const getEmptyDraftFallback = (): QuestionnaireDraft => ({
  title: '未命名问卷',
  description: '',
  footerText: '',
  components: []
})

export const buildPersistedDraft = (
  draft: QuestionnaireDraft | null,
  fallback: QuestionnaireDraft,
  idPrefix: string
) => {
  if (!draft) return null
  return normalizeDraft(draft, fallback, idPrefix)
}

export const getConversationHistory = (messages: AiChatMessage[]) =>
  messages.filter(message => message.role === 'user' || message.role === 'assistant')

export type DraftApplyPayload = {
  questionnaire: QuestionnaireDraft
  version: number
  successMessage: string
}

export type DraftStreamOptions = {
  requestIntent: AiCopilotIntent
  instruction: string
  originalInstruction?: string
  isRetry?: boolean
  startStatus: AiStreamStatus
  assistantPlaceholder: string
  appendUserMessage: boolean
}

export type BufferedUiUpdates = {
  promptDelta: string
  replacePrompt: boolean
  partialDraft: QuestionnaireDraft | null
}
