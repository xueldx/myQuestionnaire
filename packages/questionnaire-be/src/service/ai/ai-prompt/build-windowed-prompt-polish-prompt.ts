import { SanitizedCopilotDto } from '@/service/ai/ai-copilot-sanitize';
import {
  renderConversationSummaryBlock,
  renderDecisionMemoryBlock,
  renderQuestionnaireOutlineBlock,
  renderRecentMessagesBlock,
} from '@/service/ai/ai-prompt/render-context-blocks';

type WindowedPromptPolishParams = {
  dto: SanitizedCopilotDto;
  toolContextText: string;
  context: {
    conversationSummary: string;
    decisionMemory: any;
    recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
    questionnaireOutline: {
      title: string;
      description: string;
      footerText: string;
      componentCount: number;
      components: Array<{
        fe_id: string;
        type: string;
        title: string;
      }>;
    };
  };
};

export const buildWindowedPromptPolishPrompt = ({
  dto,
  toolContextText,
  context,
}: WindowedPromptPolishParams) => {
  const hasExistingComponents = dto.questionnaire.components.length > 0;
  const generationTarget = hasExistingComponents
    ? [
        '当前问卷已经有内容，润色后的 Prompt 必须明确表达“基于现有问卷继续新增内容，不要整份覆盖旧问卷”。',
        '如果用户没有明确新增位置，不要臆造具体组件索引，只需要强调“新增一批可插入的组件”。',
        '如果需要描述新增内容，只描述题型方向、数量范围和填写目标，不要提前展开成每一道题的具体题干或选项。',
      ].join('\n')
    : [
        '当前问卷为空，润色后的 Prompt 应该引导生成一份完整的新问卷。',
        '请补足主题、目标人群、题型结构、题量和输出质量要求，让后续问卷生成更稳定。',
        '这里的“补足”只限于生成约束，不要直接替用户写出详细题目、选项内容或逐题清单。',
      ].join('\n');

  return `
你是问卷生成前的 Prompt 润色助手。

你的任务不是直接生成问卷 JSON，而是把用户的原始需求改写成一段“更适合问卷生成模型使用的最终 Prompt”。

你必须遵守以下规则：
1. 只输出润色后的最终 Prompt 正文，不要输出解释、标题、前言、总结、Markdown 代码块或序号。
2. 结果必须是用户可以直接再编辑后提交给“问卷生成阶段”的指令文本。
3. 优先补足以下信息：问卷主题、目标人群、题量范围、题型结构、输出风格、是否需要标题/描述/页脚。
4. 不要直接展开成详细题目、题干列表、选项列表、逐题顺序、组件 JSON 或其他实现细节；应该只保留高层生成要求和约束。
5. 可以做合理补全，但不要凭空捏造业务背景、行业黑话或不存在的数据。
6. 最终 Prompt 要简洁、可执行、可直接驱动模型生成高质量问卷。

${generationTarget}

${renderDecisionMemoryBlock(context.decisionMemory)}

${renderConversationSummaryBlock(context.conversationSummary)}

${renderRecentMessagesBlock(context.recentMessages)}

${renderQuestionnaireOutlineBlock(context.questionnaireOutline)}

[TOOL CONTEXT]
${toolContextText}

用户原始需求：
${dto.instruction}
`.trim();
};
