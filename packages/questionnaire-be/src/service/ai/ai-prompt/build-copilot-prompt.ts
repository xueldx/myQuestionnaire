import { CopilotStreamDto } from '@/service/ai/dto/copilot-stream.dto';
import { buildComponentTypeRules } from '@/service/ai/ai-prompt/build-component-type-rules';

type CopilotPromptDto = Pick<
  CopilotStreamDto,
  'intent' | 'instruction' | 'originalInstruction' | 'history' | 'questionnaire'
>;

export const buildCopilotPrompt = (
  dto: CopilotPromptDto,
  toolContextText: string,
) => {
  const snapshotJson = JSON.stringify(dto.questionnaire, null, 2);
  const historyText =
    dto.history
      .filter((item) => item.content?.trim())
      .map((item) => `${item.role}: ${item.content}`)
      .join('\n') || '无历史消息';
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
            'PAGE_CONFIG 可以沿用当前问卷信息；如果你认为无需修改标题/描述/页脚，可以直接复用当前内容。',
          ].join('\n')
        : [
            '当前问卷为空。请生成一份可直接落地的新问卷草稿。',
            '需要输出完整的 PAGE_CONFIG 和本次生成的全部组件。',
            '问卷标题和问卷描述必须根据用户需求重新生成，不能留空，不能写成“未命名问卷”或通用占位文案。',
          ].join('\n')
      : [
          '当前是 edit 模式。你需要返回本轮修改涉及的原组件，以及需要新增的组件。',
          '未提到的原组件会由系统自动保留，不要把没改的题目整份重复输出。',
          '保留未修改组件的 fe_id。',
          '新增组件请生成新的 fe_id。',
          '当前版本不要通过省略组件表达删除。',
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
其中 ASSISTANT_REPLY 块里的“自然语言回复”必须是纯文本短句，只能写最终总结内容本身；不要包含 Markdown 语法（例如 **加粗**、# 标题、- 列表、代码块、反引号），也不要把 <<<PAGE_CONFIG>>>、<<<COMPONENT>>>、<<<ASSISTANT_REPLY>>> 这类块标记当作正文内容输出。
4. 每个 COMPONENT 块都是一个完整 JSON 对象，props 必须是对象。
5. title 和 props.title 要保持一致。
6. 不要输出任何注释、序号、列表符号或多余文本。
7. 选项类组件不要输出对象数组。options、rows、columns 里的每一项都必须是纯字符串。
8. 组件标题必须是可直接给用户看的完整自然语言内容，不能只写 1/2/3 这种序号，也不能只写“简答题”“单选题”“多选题”这类占位词。

当前任务模式：${dto.intent}
${modeInstruction}

当前问卷快照：
${snapshotJson}

历史对话：
${historyText}

工具上下文：
${toolContextText}

${instructionBlock}
`.trim();
};
