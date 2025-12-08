import {
  normalizeConversationMessages,
  sanitizeAssistantReply
} from '@/pages/question/Edit/hooks/ai/aiProcessState'

describe('aiProcessState', () => {
  it('sanitizes assistant replies into plain text', () => {
    const result = sanitizeAssistantReply(
      '<<<ASSISTANT_REPLY>>>**本轮已生成问卷草稿。**<<<END_ASSISTANT_REPLY>>>'
    )

    expect(result).toBe('本轮已生成问卷草稿。')
  })

  it('sanitizes persisted assistant history when normalizing messages', () => {
    const messages = normalizeConversationMessages(
      [
        {
          id: 1,
          role: 'assistant',
          kind: 'chat',
          content: '<<<ASSISTANT_REPLY>>>- 已新增 2 道题<<<END_ASSISTANT_REPLY>>>'
        }
      ],
      'generate'
    )

    expect(messages[0].content).toBe('已新增 2 道题')
  })

  it('removes partial protocol tokens during streaming sanitization', () => {
    const result = sanitizeAssistantReply('<<ASSISTANT_REPLY>>>\n**已新增 1 道题**')

    expect(result).toBe('已新增 1 道题')
  })
})
