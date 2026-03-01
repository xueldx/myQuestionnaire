import { useCallback, useEffect, useMemo } from 'react'
import {
  AiConversationDetail,
  AiCopilotIntent,
  AiModelOption
} from '../../components/aiCopilotTypes'
import {
  AiWorkbenchSessionSnapshot,
  consumeAiWorkbenchPolishInterruptedMarker,
  writeAiWorkbenchSessionSnapshot
} from './aiWorkbenchSessionStorage'

export type AiWorkbenchSelectedModelSource = 'restored' | 'conversation' | 'default' | 'user'

type ResolvePreferredAiModelParams = {
  availableModels: AiModelOption[]
  currentModel: string
  restoredModel: string
  conversationModel: string
  source: AiWorkbenchSelectedModelSource
}

type ResolveHydratedConversationDetailParams = {
  detail: AiConversationDetail
  restoredSessionSnapshot: AiWorkbenchSessionSnapshot | null
  hasPolishInterruptedMarker: boolean
}

type UseAiWorkbenchPersistenceParams = {
  questionnaireId: string
  activeConversationId: number | null
  mode: AiCopilotIntent
  composerInput: string
  selectedModel: string
}

const normalizeModelValue = (value: string | null | undefined) => value?.trim() || ''

export const resolveHydratedConversationInstruction = (
  detail: AiConversationDetail,
  restoredSessionSnapshot: AiWorkbenchSessionSnapshot | null
) => {
  if (!restoredSessionSnapshot) {
    return detail.lastInstruction || ''
  }

  if (restoredSessionSnapshot.activeConversationId !== detail.id) {
    return detail.lastInstruction || ''
  }

  return restoredSessionSnapshot.composerInput.trim()
    ? restoredSessionSnapshot.composerInput
    : detail.lastInstruction || ''
}

export const resolveHydratedConversationDetail = ({
  detail,
  restoredSessionSnapshot,
  hasPolishInterruptedMarker
}: ResolveHydratedConversationDetailParams): AiConversationDetail => {
  const resolvedInstruction = resolveHydratedConversationInstruction(
    detail,
    restoredSessionSnapshot
  )
  const shouldDowngradeInterruptedPolishRecovery =
    hasPolishInterruptedMarker &&
    detail.lastWorkflowStage === 'polish' &&
    (detail.lastRuntimeStatus === 'background_running' ||
      detail.lastRuntimeStatus === 'resume_available')

  if (
    !shouldDowngradeInterruptedPolishRecovery &&
    resolvedInstruction === (detail.lastInstruction || '')
  ) {
    return detail
  }

  return {
    ...detail,
    lastInstruction: resolvedInstruction,
    lastRuntimeStatus: shouldDowngradeInterruptedPolishRecovery
      ? resolvedInstruction.trim()
        ? 'awaiting_confirmation'
        : detail.messages.length > 0
        ? 'done'
        : 'idle'
      : detail.lastRuntimeStatus
  }
}

export const resolvePreferredAiModel = ({
  availableModels,
  currentModel,
  restoredModel,
  conversationModel,
  source
}: ResolvePreferredAiModelParams) => {
  const modelValues = new Set(availableModels.map(item => item.value))
  const normalizedCurrentModel = normalizeModelValue(currentModel)
  const normalizedRestoredModel = normalizeModelValue(restoredModel)
  const normalizedConversationModel = normalizeModelValue(conversationModel)

  if (source === 'user' && modelValues.has(normalizedCurrentModel)) {
    return {
      model: normalizedCurrentModel,
      source
    }
  }

  if (normalizedRestoredModel && modelValues.has(normalizedRestoredModel)) {
    return {
      model: normalizedRestoredModel,
      source: 'restored' as const
    }
  }

  if (normalizedConversationModel && modelValues.has(normalizedConversationModel)) {
    return {
      model: normalizedConversationModel,
      source: 'conversation' as const
    }
  }

  if (normalizedCurrentModel && modelValues.has(normalizedCurrentModel) && source !== 'default') {
    return {
      model: normalizedCurrentModel,
      source
    }
  }

  return {
    model: availableModels[0]?.value || '',
    source: 'default' as const
  }
}

export const useAiWorkbenchPersistence = ({
  questionnaireId,
  activeConversationId,
  mode,
  composerInput,
  selectedModel
}: UseAiWorkbenchPersistenceParams) => {
  const hasPolishInterruptedMarker = useMemo(
    () => consumeAiWorkbenchPolishInterruptedMarker(questionnaireId),
    [questionnaireId]
  )

  const persistSessionSnapshot = useCallback(
    (
      overrides?: Partial<
        Pick<
          AiWorkbenchSessionSnapshot,
          'activeConversationId' | 'mode' | 'composerInput' | 'selectedModel'
        >
      >
    ) =>
      writeAiWorkbenchSessionSnapshot({
        questionnaireId,
        activeConversationId: overrides?.activeConversationId ?? activeConversationId,
        mode: overrides?.mode ?? mode,
        composerInput: overrides?.composerInput ?? composerInput,
        selectedModel: overrides?.selectedModel ?? selectedModel
      }),
    [activeConversationId, composerInput, mode, questionnaireId, selectedModel]
  )

  useEffect(() => {
    persistSessionSnapshot()
  }, [persistSessionSnapshot])

  return {
    hasPolishInterruptedMarker,
    persistSessionSnapshot
  }
}
