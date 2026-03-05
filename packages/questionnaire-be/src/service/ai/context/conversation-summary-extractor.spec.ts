import OpenAI from 'openai';
import {
  extractConversationSummary,
  normalizeDecisionMemory,
} from '@/service/ai/context/conversation-summary-extractor';

describe('conversation-summary-extractor', () => {
  it('normalizes decision memory fields', () => {
    expect(
      normalizeDecisionMemory({
        goal: 123,
        must_have: ['A', 2],
      }),
    ).toEqual({
      goal: '123',
      audience: '',
      tone: '',
      must_have: ['A', '2'],
      must_not: [],
      accepted_changes: [],
      rejected_changes: [],
      pending_tasks: [],
    });
  });

  it('parses compacted summary JSON from model output', async () => {
    const create = jest.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: `\`\`\`json
{"summaryText":"已确认高校新生调研方向","decisionMemory":{"goal":"生成校园满意度问卷","audience":"高校新生","tone":"正式","must_have":["满意度题"],"must_not":["开放式长文本"],"accepted_changes":["加入食堂部分"],"rejected_changes":["删除基础信息"],"pending_tasks":["补充社团题"]}}
\`\`\``,
          },
        },
      ],
    });
    const client = {
      chat: {
        completions: {
          create,
        },
      },
    } as unknown as OpenAI;

    await expect(
      extractConversationSummary(client, 'test-model', {
        currentSummary: '旧摘要',
        currentDecisionMemory: {},
        newMessages: [
          {
            role: 'user',
            content: '请补充食堂满意度和社团参与题',
          },
        ],
      }),
    ).resolves.toEqual({
      summaryText: '已确认高校新生调研方向',
      decisionMemory: {
        goal: '生成校园满意度问卷',
        audience: '高校新生',
        tone: '正式',
        must_have: ['满意度题'],
        must_not: ['开放式长文本'],
        accepted_changes: ['加入食堂部分'],
        rejected_changes: ['删除基础信息'],
        pending_tasks: ['补充社团题'],
      },
    });
    expect(create).toHaveBeenCalledTimes(1);
  });
});
