import { sanitizeAssistantReply } from '@/service/ai/utils/sanitize-assistant-reply';

describe('sanitizeAssistantReply', () => {
  it('removes protocol markers and markdown formatting from assistant summaries', () => {
    const result = sanitizeAssistantReply(`
<<<ASSISTANT_REPLY>>>
**本轮已生成顾客满意度问卷草稿。**
<<<END_ASSISTANT_REPLY>>>
`);

    expect(result).toBe('本轮已生成顾客满意度问卷草稿。');
  });

  it('strips inline markers and list prefixes from fallback assistant replies', () => {
    const result = sanitizeAssistantReply(
      '<<<ASSISTANT_REPLY>>>- 已新增 3 道题<<<END_ASSISTANT_REPLY>>>',
    );

    expect(result).toBe('已新增 3 道题');
  });

  it('removes partial or bare protocol tokens in streaming text', () => {
    const result = sanitizeAssistantReply(
      '<<ASSISTANT_REPLY>>>\n**已新增 2 道题**',
    );

    expect(result).toBe('已新增 2 道题');
  });
});
