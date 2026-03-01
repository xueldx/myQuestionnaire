import { useEffect } from 'react'
import {
  AiCopilotIntent,
  AiLocalInterruptedStreamKind,
  AiStreamStatus
} from '../../components/aiCopilotTypes'
import { BufferedUiUpdates, resolveComposerInputWithBuffer } from './aiShared'
import { markAiWorkbenchPolishInterrupted } from './aiWorkbenchSessionStorage'

const ACTIVE_STREAM_STATUSES: AiStreamStatus[] = [
  'connecting',
  'polishing',
  'thinking',
  'answering',
  'drafting'
]

type UseAiWorkbenchLeaveGuardParams = {
  questionnaireId: string
  activeConversationId: number | null
  mode: AiCopilotIntent
  composerInput: string
  selectedModel: string
  status: AiStreamStatus
  hasPendingAiResult: boolean
  activeStreamKindRef: { current: AiLocalInterruptedStreamKind | null }
  bufferedUiUpdatesRef: { current: BufferedUiUpdates }
  flushBufferedUiUpdates: (immediate?: boolean) => void
  persistSessionSnapshot: (overrides?: {
    activeConversationId?: number | null
    mode?: AiCopilotIntent
    composerInput?: string
    selectedModel?: string
  }) => boolean
}

type ShouldBlockAiWorkbenchLeaveParams = {
  status: AiStreamStatus
  composerInput: string
  hasPendingAiResult: boolean
}

export const shouldBlockAiWorkbenchLeave = ({
  status,
  composerInput,
  hasPendingAiResult
}: ShouldBlockAiWorkbenchLeaveParams) =>
  ACTIVE_STREAM_STATUSES.includes(status) ||
  status === 'background_running' ||
  hasPendingAiResult ||
  Boolean(composerInput.trim())

export const useAiWorkbenchLeaveGuard = ({
  questionnaireId,
  activeConversationId,
  mode,
  composerInput,
  selectedModel,
  status,
  hasPendingAiResult,
  activeStreamKindRef,
  bufferedUiUpdatesRef,
  flushBufferedUiUpdates,
  persistSessionSnapshot
}: UseAiWorkbenchLeaveGuardParams) => {
  useEffect(() => {
    if (typeof window === 'undefined') return

    const buildPersistedComposerInput = () =>
      resolveComposerInputWithBuffer(composerInput, bufferedUiUpdatesRef.current)

    const persistLatestSnapshot = () => {
      const nextComposerInput = buildPersistedComposerInput()

      flushBufferedUiUpdates(true)
      persistSessionSnapshot({
        activeConversationId,
        mode,
        composerInput: nextComposerInput,
        selectedModel
      })

      return nextComposerInput
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const nextComposerInput = persistLatestSnapshot()

      if (
        !shouldBlockAiWorkbenchLeave({
          status,
          composerInput: nextComposerInput,
          hasPendingAiResult
        })
      ) {
        return
      }

      event.preventDefault()
      event.returnValue = ''
    }

    const handlePageHide = () => {
      persistLatestSnapshot()

      if (activeStreamKindRef.current === 'polish' || status === 'polishing') {
        markAiWorkbenchPolishInterrupted(questionnaireId)
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [
    activeConversationId,
    activeStreamKindRef,
    bufferedUiUpdatesRef,
    composerInput,
    flushBufferedUiUpdates,
    hasPendingAiResult,
    mode,
    persistSessionSnapshot,
    questionnaireId,
    selectedModel,
    status
  ])
}
