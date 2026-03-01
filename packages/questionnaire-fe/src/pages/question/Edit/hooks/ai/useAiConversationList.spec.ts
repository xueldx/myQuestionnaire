jest.mock('@/apis', () => ({
  __esModule: true,
  default: {
    aiApi: {}
  }
}))

import { resolveConversationHydrationTargetId } from '@/pages/question/Edit/hooks/ai/useAiConversationList'

const conversationList = [
  {
    id: 11
  },
  {
    id: 22
  }
] as any

describe('useAiConversationList', () => {
  it('prefers the restored conversation id when it still exists', () => {
    expect(
      resolveConversationHydrationTargetId({
        preferredConversationId: 22,
        activeConversationId: 11,
        conversationList
      })
    ).toBe(22)
  })

  it('falls back to the active conversation when the restored id no longer exists', () => {
    expect(
      resolveConversationHydrationTargetId({
        preferredConversationId: 99,
        activeConversationId: 11,
        conversationList
      })
    ).toBe(11)
  })

  it('falls back to the first conversation when neither preferred nor active id matches', () => {
    expect(
      resolveConversationHydrationTargetId({
        preferredConversationId: 99,
        activeConversationId: 88,
        conversationList
      })
    ).toBe(11)
  })
})
