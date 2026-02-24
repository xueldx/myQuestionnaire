import {
  DEFAULT_AI_PREVIEW_AUTO_FOLLOW_STATE,
  getNextAutoFollowStateFromCardInteraction,
  getNextAutoFollowStateFromViewport,
  resolveAutoFollowScrollBehavior,
  shouldPauseAutoFollowForCardInteraction
} from './useAiPreviewAutoFollow'

describe('useAiPreviewAutoFollow helpers', () => {
  it('uses smooth scroll when the latest target changes to a new card', () => {
    expect(
      resolveAutoFollowScrollBehavior(
        { cardId: 'add:q1', signature: 'add:q1|sig-a' },
        { cardId: 'add:q2', signature: 'add:q2|sig-b' }
      )
    ).toBe('smooth')
  })

  it('uses auto scroll when the same target card keeps streaming more content', () => {
    expect(
      resolveAutoFollowScrollBehavior(
        { cardId: 'update:q1', signature: 'update:q1|sig-a' },
        { cardId: 'update:q1', signature: 'update:q1|sig-b' }
      )
    ).toBe('auto')
  })

  it('pauses auto follow when the user interacts with an older card', () => {
    expect(shouldPauseAutoFollowForCardInteraction('current:q1', 'add:q2')).toBe(true)
    expect(
      getNextAutoFollowStateFromCardInteraction(
        DEFAULT_AI_PREVIEW_AUTO_FOLLOW_STATE,
        'current:q1',
        'add:q2'
      )
    ).toEqual({
      autoFollowEnabled: false,
      showJumpToLatest: true
    })
  })

  it('keeps auto follow when the user interacts with the latest card', () => {
    expect(shouldPauseAutoFollowForCardInteraction('add:q2', 'add:q2')).toBe(false)
    expect(
      getNextAutoFollowStateFromCardInteraction(
        DEFAULT_AI_PREVIEW_AUTO_FOLLOW_STATE,
        'add:q2',
        'add:q2'
      )
    ).toEqual(DEFAULT_AI_PREVIEW_AUTO_FOLLOW_STATE)
  })

  it('resumes auto follow after the latest card comes back into view', () => {
    expect(
      getNextAutoFollowStateFromViewport(
        {
          autoFollowEnabled: false,
          showJumpToLatest: true
        },
        {
          isNearLatest: true,
          manualInterruption: false
        }
      )
    ).toEqual(DEFAULT_AI_PREVIEW_AUTO_FOLLOW_STATE)
  })

  it('shows the jump action while the user is manually away from the latest card', () => {
    expect(
      getNextAutoFollowStateFromViewport(DEFAULT_AI_PREVIEW_AUTO_FOLLOW_STATE, {
        isNearLatest: false,
        manualInterruption: true
      })
    ).toEqual({
      autoFollowEnabled: false,
      showJumpToLatest: true
    })
  })
})
