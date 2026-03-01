import { AiCopilotIntent } from '../../components/aiCopilotTypes'

const AI_WORKBENCH_SESSION_STORAGE_VERSION = 1
const AI_WORKBENCH_SESSION_STORAGE_KEY = 'questionnaire-ai-workbench-session'
const AI_WORKBENCH_POLISH_INTERRUPT_KEY = 'questionnaire-ai-workbench-polish-interrupted'

export type AiWorkbenchSessionSnapshot = {
  version: number
  questionnaireId: string
  activeConversationId: number | null
  mode: AiCopilotIntent
  composerInput: string
  selectedModel: string
  updatedAt: string
}

export type AiWorkbenchPolishInterruptedMarker = {
  version: number
  questionnaireId: string
  interruptedAt: string
}

const normalizeQuestionnaireId = (questionnaireId: string | number) =>
  String(questionnaireId || '').trim()

const buildAiWorkbenchSessionStorageKey = (questionnaireId: string) =>
  `${AI_WORKBENCH_SESSION_STORAGE_KEY}:${questionnaireId}`

const buildAiWorkbenchPolishInterruptedKey = (questionnaireId: string) =>
  `${AI_WORKBENCH_POLISH_INTERRUPT_KEY}:${questionnaireId}`

const normalizeConversationId = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null

const normalizeMode = (value: unknown): AiCopilotIntent => (value === 'edit' ? 'edit' : 'generate')

const normalizeString = (value: unknown) => (typeof value === 'string' ? value : '')

const normalizeIsoDateString = (value: unknown) => {
  const nextValue = typeof value === 'string' ? value.trim() : ''
  return nextValue || new Date().toISOString()
}

const parseStorageJson = (rawValue: string | null) => {
  if (!rawValue) return null

  try {
    return JSON.parse(rawValue) as Record<string, unknown>
  } catch (error) {
    console.warn('解析 AI 工作台本地会话快照失败:', error)
    return null
  }
}

const normalizeSessionSnapshot = (
  value: unknown,
  questionnaireId: string
): AiWorkbenchSessionSnapshot | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const record = value as Record<string, unknown>
  const storedQuestionnaireId = normalizeQuestionnaireId(record.questionnaireId as string)
  if (storedQuestionnaireId && storedQuestionnaireId !== questionnaireId) {
    return null
  }

  return {
    version:
      typeof record.version === 'number' && Number.isFinite(record.version)
        ? record.version
        : AI_WORKBENCH_SESSION_STORAGE_VERSION,
    questionnaireId,
    activeConversationId: normalizeConversationId(record.activeConversationId),
    mode: normalizeMode(record.mode),
    composerInput: normalizeString(record.composerInput),
    selectedModel: normalizeString(record.selectedModel).trim(),
    updatedAt: normalizeIsoDateString(record.updatedAt)
  }
}

const normalizePolishInterruptedMarker = (
  value: unknown,
  questionnaireId: string
): AiWorkbenchPolishInterruptedMarker | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const record = value as Record<string, unknown>
  const storedQuestionnaireId = normalizeQuestionnaireId(record.questionnaireId as string)
  if (storedQuestionnaireId && storedQuestionnaireId !== questionnaireId) {
    return null
  }

  return {
    version:
      typeof record.version === 'number' && Number.isFinite(record.version)
        ? record.version
        : AI_WORKBENCH_SESSION_STORAGE_VERSION,
    questionnaireId,
    interruptedAt: normalizeIsoDateString(record.interruptedAt)
  }
}

export const readAiWorkbenchSessionSnapshot = (questionnaireId: string | number) => {
  if (typeof window === 'undefined') return null

  const normalizedQuestionnaireId = normalizeQuestionnaireId(questionnaireId)
  if (!normalizedQuestionnaireId) return null

  const parsedValue = parseStorageJson(
    window.localStorage.getItem(buildAiWorkbenchSessionStorageKey(normalizedQuestionnaireId))
  )

  return normalizeSessionSnapshot(parsedValue, normalizedQuestionnaireId)
}

export const writeAiWorkbenchSessionSnapshot = (
  snapshot: Omit<AiWorkbenchSessionSnapshot, 'version' | 'updatedAt'> & {
    updatedAt?: string
  }
) => {
  if (typeof window === 'undefined') return false

  const normalizedQuestionnaireId = normalizeQuestionnaireId(snapshot.questionnaireId)
  if (!normalizedQuestionnaireId) return false

  const normalizedSnapshot: AiWorkbenchSessionSnapshot = {
    version: AI_WORKBENCH_SESSION_STORAGE_VERSION,
    questionnaireId: normalizedQuestionnaireId,
    activeConversationId: normalizeConversationId(snapshot.activeConversationId),
    mode: normalizeMode(snapshot.mode),
    composerInput: normalizeString(snapshot.composerInput),
    selectedModel: normalizeString(snapshot.selectedModel).trim(),
    updatedAt: normalizeIsoDateString(snapshot.updatedAt)
  }

  try {
    window.localStorage.setItem(
      buildAiWorkbenchSessionStorageKey(normalizedQuestionnaireId),
      JSON.stringify(normalizedSnapshot)
    )
    return true
  } catch (error) {
    console.warn('写入 AI 工作台本地会话快照失败:', error)
    return false
  }
}

export const markAiWorkbenchPolishInterrupted = (questionnaireId: string | number) => {
  if (typeof window === 'undefined') return false

  const normalizedQuestionnaireId = normalizeQuestionnaireId(questionnaireId)
  if (!normalizedQuestionnaireId) return false

  const marker: AiWorkbenchPolishInterruptedMarker = {
    version: AI_WORKBENCH_SESSION_STORAGE_VERSION,
    questionnaireId: normalizedQuestionnaireId,
    interruptedAt: new Date().toISOString()
  }

  try {
    window.sessionStorage.setItem(
      buildAiWorkbenchPolishInterruptedKey(normalizedQuestionnaireId),
      JSON.stringify(marker)
    )
    return true
  } catch (error) {
    console.warn('写入 AI 工作台润色中断标记失败:', error)
    return false
  }
}

export const consumeAiWorkbenchPolishInterruptedMarker = (questionnaireId: string | number) => {
  if (typeof window === 'undefined') return false

  const normalizedQuestionnaireId = normalizeQuestionnaireId(questionnaireId)
  if (!normalizedQuestionnaireId) return false

  const storageKey = buildAiWorkbenchPolishInterruptedKey(normalizedQuestionnaireId)
  const parsedValue = parseStorageJson(window.sessionStorage.getItem(storageKey))

  try {
    window.sessionStorage.removeItem(storageKey)
  } catch (error) {
    console.warn('移除 AI 工作台润色中断标记失败:', error)
  }

  return Boolean(normalizePolishInterruptedMarker(parsedValue, normalizedQuestionnaireId))
}
