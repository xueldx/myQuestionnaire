import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AiPreviewCardEntry,
  AiPreviewLatestTarget,
  resolveLatestPreviewTarget
} from '../components/aiInlinePreviewModel'

const PROGRAMMATIC_SCROLL_GRACE_MS = 500
const FOLLOW_VIEWPORT_OFFSET = 112
const FOLLOW_VIEWPORT_TOLERANCE = 56

export type AiPreviewAutoFollowState = {
  autoFollowEnabled: boolean
  showJumpToLatest: boolean
}

export const DEFAULT_AI_PREVIEW_AUTO_FOLLOW_STATE: AiPreviewAutoFollowState = {
  autoFollowEnabled: true,
  showJumpToLatest: false
}

export const resolveAutoFollowScrollBehavior = (
  previousTarget: AiPreviewLatestTarget | null,
  nextTarget: AiPreviewLatestTarget | null
): ScrollBehavior | null => {
  if (!nextTarget) return null
  if (!previousTarget) return 'smooth'
  if (previousTarget.cardId !== nextTarget.cardId) return 'smooth'
  if (previousTarget.signature !== nextTarget.signature) return 'auto'
  return null
}

export const shouldPauseAutoFollowForCardInteraction = (
  interactedCardId: string,
  latestTargetCardId: string | null
) => Boolean(interactedCardId && latestTargetCardId && interactedCardId !== latestTargetCardId)

export const getNextAutoFollowStateFromCardInteraction = (
  currentState: AiPreviewAutoFollowState,
  interactedCardId: string,
  latestTargetCardId: string | null
): AiPreviewAutoFollowState =>
  shouldPauseAutoFollowForCardInteraction(interactedCardId, latestTargetCardId)
    ? {
        autoFollowEnabled: false,
        showJumpToLatest: Boolean(latestTargetCardId)
      }
    : currentState

export const getNextAutoFollowStateFromViewport = (
  currentState: AiPreviewAutoFollowState,
  {
    isNearLatest,
    manualInterruption
  }: {
    isNearLatest: boolean
    manualInterruption: boolean
  }
): AiPreviewAutoFollowState => {
  if (isNearLatest) return DEFAULT_AI_PREVIEW_AUTO_FOLLOW_STATE
  if (manualInterruption) {
    return {
      autoFollowEnabled: false,
      showJumpToLatest: true
    }
  }
  if (!currentState.autoFollowEnabled) {
    return {
      autoFollowEnabled: false,
      showJumpToLatest: true
    }
  }
  return currentState
}

const isCardNearFollowViewport = (container: HTMLElement, element: HTMLElement) => {
  const cardTop = element.offsetTop - container.scrollTop
  const minTop = FOLLOW_VIEWPORT_OFFSET - FOLLOW_VIEWPORT_TOLERANCE
  const maxTop = container.clientHeight - FOLLOW_VIEWPORT_TOLERANCE

  return cardTop >= minTop && cardTop <= maxTop
}

type UseAiPreviewAutoFollowParams = {
  entries: AiPreviewCardEntry[]
  active: boolean
}

export const useAiPreviewAutoFollow = ({ entries, active }: UseAiPreviewAutoFollowParams) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const latestTarget = useMemo(
    () => (active ? resolveLatestPreviewTarget(entries) : null),
    [active, entries]
  )
  const latestTargetRef = useRef<AiPreviewLatestTarget | null>(latestTarget)
  const programmaticScrollUntilRef = useRef(0)
  const manualScrollIntentRef = useRef(false)
  const [state, setState] = useState<AiPreviewAutoFollowState>(DEFAULT_AI_PREVIEW_AUTO_FOLLOW_STATE)

  const isLatestTargetNearViewport = useCallback(
    (target = latestTarget) => {
      if (!target?.cardId) return false

      const container = containerRef.current
      const element = cardRefs.current[target.cardId]
      if (!container || !element) return false

      return isCardNearFollowViewport(container, element)
    },
    [latestTarget]
  )

  const scrollToCard = useCallback((cardId: string, behavior: ScrollBehavior) => {
    const element = cardRefs.current[cardId]
    if (!element) return

    programmaticScrollUntilRef.current = Date.now() + PROGRAMMATIC_SCROLL_GRACE_MS
    element.scrollIntoView({
      behavior,
      block: 'start'
    })
  }, [])

  const getCardRef = useCallback(
    (cardId: string) => (node: HTMLDivElement | null) => {
      cardRefs.current[cardId] = node
    },
    []
  )

  const markManualScrollIntent = useCallback(() => {
    manualScrollIntentRef.current = true
  }, [])

  const handleCardInteraction = useCallback(
    (cardId: string) => {
      setState(currentState =>
        getNextAutoFollowStateFromCardInteraction(
          currentState,
          cardId,
          latestTarget?.cardId || null
        )
      )
    },
    [latestTarget]
  )

  const handleJumpToLatest = useCallback(() => {
    if (!latestTarget?.cardId) return

    setState(DEFAULT_AI_PREVIEW_AUTO_FOLLOW_STATE)
    scrollToCard(latestTarget.cardId, 'smooth')
  }, [latestTarget, scrollToCard])

  useEffect(() => {
    if (!active) {
      latestTargetRef.current = null
      setState(DEFAULT_AI_PREVIEW_AUTO_FOLLOW_STATE)
      return
    }

    if (!latestTarget?.cardId) {
      latestTargetRef.current = null
      setState(DEFAULT_AI_PREVIEW_AUTO_FOLLOW_STATE)
      return
    }

    const behavior = resolveAutoFollowScrollBehavior(latestTargetRef.current, latestTarget)
    latestTargetRef.current = latestTarget

    const rafId = window.requestAnimationFrame(() => {
      const isNearLatest = isLatestTargetNearViewport(latestTarget)

      if (state.autoFollowEnabled) {
        if (behavior) {
          scrollToCard(latestTarget.cardId, behavior)
        }
        setState(DEFAULT_AI_PREVIEW_AUTO_FOLLOW_STATE)
        return
      }

      if (isNearLatest) {
        setState(DEFAULT_AI_PREVIEW_AUTO_FOLLOW_STATE)
        return
      }

      setState(currentState => ({
        ...currentState,
        showJumpToLatest: true
      }))
    })

    return () => window.cancelAnimationFrame(rafId)
  }, [active, isLatestTargetNearViewport, latestTarget, scrollToCard, state.autoFollowEnabled])

  useEffect(() => {
    const container = containerRef.current
    if (!active || !container) return

    const handleScroll = () => {
      const isProgrammaticScroll = Date.now() < programmaticScrollUntilRef.current
      const nextState = getNextAutoFollowStateFromViewport(state, {
        isNearLatest: isLatestTargetNearViewport(),
        manualInterruption: manualScrollIntentRef.current && !isProgrammaticScroll
      })

      manualScrollIntentRef.current = false
      setState(currentState =>
        currentState.autoFollowEnabled === nextState.autoFollowEnabled &&
        currentState.showJumpToLatest === nextState.showJumpToLatest
          ? currentState
          : nextState
      )
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [active, isLatestTargetNearViewport, state])

  return {
    containerRef,
    getCardRef,
    handleCardInteraction,
    handleJumpToLatest,
    showJumpToLatest: active && Boolean(latestTarget?.cardId) && state.showJumpToLatest,
    containerEventHandlers: {
      onWheelCapture: markManualScrollIntent,
      onTouchMoveCapture: markManualScrollIntent,
      onPointerDownCapture: markManualScrollIntent
    }
  }
}
