import OpenAI from 'openai';
import {
  DecisionMemory,
  EMPTY_DECISION_MEMORY,
  SanitizedHistoryMessage,
} from '@/service/ai/context/context-types';
import {
  ensureObject,
  ensureString,
  normalizeStringList,
} from '@/service/ai/ai-copilot-sanitize';

type SummaryExtractionResult = {
  summaryText: string;
  decisionMemory: DecisionMemory;
};

const extractJsonObject = (content: string) => {
  const normalized = content
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '');

  try {
    return JSON.parse(normalized);
  } catch (error) {
    const start = normalized.indexOf('{');
    const end = normalized.lastIndexOf('}');
    if (start < 0 || end <= start) {
      throw error;
    }
    return JSON.parse(normalized.slice(start, end + 1));
  }
};

export const normalizeDecisionMemory = (value: unknown): DecisionMemory => {
  const snapshot = ensureObject(value);
  return {
    goal: ensureString(snapshot.goal),
    audience: ensureString(snapshot.audience),
    tone: ensureString(snapshot.tone),
    must_have: normalizeStringList(snapshot.must_have),
    must_not: normalizeStringList(snapshot.must_not),
    accepted_changes: normalizeStringList(snapshot.accepted_changes),
    rejected_changes: normalizeStringList(snapshot.rejected_changes),
    pending_tasks: normalizeStringList(snapshot.pending_tasks),
  };
};

export const extractConversationSummary = async (
  client: OpenAI,
  model: string,
  params: {
    currentSummary: string | null | undefined;
    currentDecisionMemory: unknown;
    newMessages: SanitizedHistoryMessage[];
  },
): Promise<SummaryExtractionResult> => {
  const conversationDeltaText =
    params.newMessages
      .map((message) => `${message.role}: ${message.content}`)
      .join('\n') || '无新增消息';
  const currentDecisionMemory = normalizeDecisionMemory(
    params.currentDecisionMemory,
  );

  const response = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: [
          '你是问卷 Copilot 的上下文压缩器。',
          '请基于旧摘要、旧结构化记忆和新增对话，输出新的完整摘要和完整 decision memory。',
          '只能输出 JSON 对象，不要输出 Markdown、代码块或解释。',
          'JSON 结构必须为：',
          '{"summaryText":"...","decisionMemory":{"goal":"","audience":"","tone":"","must_have":[],"must_not":[],"accepted_changes":[],"rejected_changes":[],"pending_tasks":[]}}',
          'summaryText 应该简洁，保留任务目标、硬约束、禁止项、已确认决定和待处理事项。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          '旧摘要：',
          params.currentSummary?.trim() || '无',
          '',
          '旧 decision memory：',
          JSON.stringify(currentDecisionMemory, null, 2),
          '',
          '新增对话：',
          conversationDeltaText,
        ].join('\n'),
      },
    ],
  });

  const content = ensureString(response.choices[0]?.message?.content);
  if (!content) {
    throw new Error('上下文压缩未返回有效内容');
  }

  const parsed = ensureObject(extractJsonObject(content));
  const summaryText = ensureString(parsed.summaryText);
  if (!summaryText) {
    throw new Error('上下文压缩结果缺少 summaryText');
  }

  return {
    summaryText,
    decisionMemory: normalizeDecisionMemory(
      parsed.decisionMemory || EMPTY_DECISION_MEMORY,
    ),
  };
};
