import { SanitizedCopilotDto } from '@/service/ai/ai-copilot-sanitize';
import { buildComponentTypeRules } from '@/service/ai/ai-prompt/build-component-type-rules';
import { FocusedSlice } from '@/service/ai/context/context-types';
import {
  renderConversationSummaryBlock,
  renderDecisionMemoryBlock,
  renderFocusedSliceBlock,
  renderQuestionnaireOutlineBlock,
  renderRecentMessagesBlock,
} from '@/service/ai/ai-prompt/render-context-blocks';

type WindowedCopilotPromptParams = {
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
    focusedSlice: FocusedSlice | null;
  };
};

export const buildWindowedCopilotPrompt = ({
  dto,
  toolContextText,
  context,
}: WindowedCopilotPromptParams) => {
  const hasExistingComponents = dto.questionnaire.components.length > 0;
  const originalInstruction =
    dto.originalInstruction?.trim() || dto.instruction;
  const instructionBlock =
    dto.intent === 'generate'
      ? `用户原始需求：
${originalInstruction}

用户确认后的生成指令：
${dto.instruction}`
      : `用户本轮修改指令：
${dto.instruction}`;

  const modeInstruction =
    dto.intent === 'generate'
      ? hasExistingComponents
        ? [
            '当前问卷已经有内容。本轮 generate 的目标不是整份替换，而是基于现有问卷继续新增一批可插入的组件。',
            '你输出的草稿只包含“本次新增的组件”，不要把原问卷已有组件重新重复输出。',
            '如果无需修改标题、描述或页脚，沿用 outline 中的现有内容。',
          ].join('\n')
        : [
            '当前问卷为空。请生成一份可直接落地的新问卷草稿。',
            '需要输出完整的 PAGE_CONFIG 和本次生成的全部组件。',
            '问卷标题和问卷描述必须根据用户需求重新生成，不能使用占位文案。',
          ].join('\n')
      : [
          '当前是 edit 模式。你只需要返回本轮真正修改的题目，以及明确要求新增的题目。',
          '未提到的原组件会由系统自动保留，不要把没改的题目整份重复输出。',
          '如果用户指令提到“第 N 题”，必须根据 QUESTIONNAIRE OUTLINE 和 FOCUSED SLICE 中的题号定位目标题目。',
          '当前版本只支持单题 AI 修改。优先以 FOCUSED SLICE 中的“当前选中题”为唯一旧题修改目标。',
          '修改已有题目时必须保留原 fe_id；新增题目时才生成新的 fe_id。',
          '不要通过省略组件表达删除。',
        ].join('\n');

  return `
你是问卷编辑器里的 AI Copilot。你要根据用户指令，生成可直接用于问卷编辑器的结构化草稿。

你必须严格遵守以下规则：
1. 只允许使用以下组件类型：
${buildComponentTypeRules()}
2. 输出必须严格使用块级协议，不能输出 Markdown 代码块，不能输出协议之外的解释。
3. 输出顺序必须固定为：

<<<PAGE_CONFIG>>>
{"title":"...","description":"...","footerText":"..."}
<<<END_PAGE_CONFIG>>>

<<<COMPONENT>>>
{"fe_id":"...","type":"questionRadio","title":"...","props":{"title":"..."}}
<<<END_COMPONENT>>>

可以重复多个 COMPONENT 块，结束组件输出后必须输出：
<<<END_DRAFT>>>

最后必须输出你的自然语言回复（方便做一些简短总结）：
<<<ASSISTANT_REPLY>>>
自然语言回复
<<<END_ASSISTANT_REPLY>>>
其中 ASSISTANT_REPLY 块里的“自然语言回复”必须是纯文本短句，只能写最终总结内容本身；不要包含 Markdown 语法，也不要把协议块标记当作正文内容输出。
4. 每个 COMPONENT 块都是一个完整 JSON 对象，props 必须是对象。
5. title 和 props.title 要保持一致。
6. 不要输出任何注释、序号、列表符号或多余文本。
7. 选项类组件不要输出对象数组。options、rows、columns 里的每一项都必须是纯字符串。
8. 组件标题必须是可直接给用户看的完整自然语言内容，不能只写序号或题型占位词。

当前任务模式：${dto.intent}
${modeInstruction}

${renderDecisionMemoryBlock(context.decisionMemory)}

${renderConversationSummaryBlock(context.conversationSummary)}

${renderRecentMessagesBlock(context.recentMessages)}

${renderQuestionnaireOutlineBlock(context.questionnaireOutline)}

${renderFocusedSliceBlock(context.focusedSlice)}

[TOOL CONTEXT]
${toolContextText}

${instructionBlock}
`.trim();
};
