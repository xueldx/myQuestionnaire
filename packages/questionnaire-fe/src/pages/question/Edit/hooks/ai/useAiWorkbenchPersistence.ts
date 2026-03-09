/**
 * AI 工作台会话持久化 hook。
 * 这个文件位于 hooks 层，负责把当前会话的本地输入、会话归属和模型选择写回浏览器存储，供刷新或回到编辑页时恢复。
 * 这里要特别控制写入频率，因为 `composerInput` 是高频输入源；如果每次按键都同步写 localStorage，会直接放大输入卡顿。
 */
import { useCallback, useEffect, useMemo, useRef } from 'react'
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

const SESSION_SNAPSHOT_DEBOUNCE_MS = 240

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

type PersistableSessionSnapshot = Parameters<typeof writeAiWorkbenchSessionSnapshot>[0]

const buildPersistableSessionSnapshot = ({
  questionnaireId,
  activeConversationId,
  mode,
  composerInput,
  selectedModel
}: {
  questionnaireId: string
  activeConversationId: number | null
  mode: AiCopilotIntent
  composerInput: string
  selectedModel: string
}): PersistableSessionSnapshot => ({
  questionnaireId,
  activeConversationId,
  mode,
  composerInput,
  selectedModel
})

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
  const latestSnapshotRef = useRef<PersistableSessionSnapshot>(
    buildPersistableSessionSnapshot({
      questionnaireId,
      activeConversationId,
      mode,
      composerInput,
      selectedModel
    })
  )

  useEffect(() => {
    latestSnapshotRef.current = buildPersistableSessionSnapshot({
      questionnaireId,
      activeConversationId,
      mode,
      composerInput,
      selectedModel
    })
  }, [activeConversationId, composerInput, mode, questionnaireId, selectedModel])

  const persistSessionSnapshot = useCallback(
    (
      overrides?: Partial<
        Pick<
          AiWorkbenchSessionSnapshot,
          'activeConversationId' | 'mode' | 'composerInput' | 'selectedModel'
        >
      >
    ) => {
      const snapshot = buildPersistableSessionSnapshot({
        questionnaireId,
        activeConversationId: overrides?.activeConversationId ?? activeConversationId,
        mode: overrides?.mode ?? mode,
        composerInput: overrides?.composerInput ?? composerInput,
        selectedModel: overrides?.selectedModel ?? selectedModel
      })

      latestSnapshotRef.current = snapshot
      return writeAiWorkbenchSessionSnapshot(snapshot)
    },
    [activeConversationId, composerInput, mode, questionnaireId, selectedModel]
  )

  useEffect(() => {
    // 输入过程中合并短时间内的多次变化，避免 TextArea 每个按键都阻塞在 localStorage 写入上。
    const timeoutId = window.setTimeout(() => {
      writeAiWorkbenchSessionSnapshot(latestSnapshotRef.current)
    }, SESSION_SNAPSHOT_DEBOUNCE_MS)

    return () => window.clearTimeout(timeoutId)
  }, [activeConversationId, composerInput, mode, questionnaireId, selectedModel])

  useEffect(() => {
    // 页面内路由切换会直接卸载工作台，这里兜底落一次最新快照，避免 debounce 尚未触发时丢失未发送输入。
    return () => {
      writeAiWorkbenchSessionSnapshot(latestSnapshotRef.current)
    }
  }, [])

  return {
    hasPolishInterruptedMarker,
    persistSessionSnapshot
  }
}
