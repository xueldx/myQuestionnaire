import {
  DecisionMemory,
  FocusedSlice,
  QuestionnaireOutline,
  SanitizedHistoryMessage,
} from '@/service/ai/context/context-types';

const renderBlock = (title: string, content: string) =>
  [`[${title}]`, content.trim() || '无'].join('\n');

const renderStringList = (title: string, value: string[]) =>
  `${title}：${value.length > 0 ? value.join('；') : '无'}`;

export const renderDecisionMemoryBlock = (decisionMemory: DecisionMemory) =>
  renderBlock(
    'DECISION MEMORY',
    [
      `goal：${decisionMemory.goal || '无'}`,
      `audience：${decisionMemory.audience || '无'}`,
      `tone：${decisionMemory.tone || '无'}`,
      renderStringList('must_have', decisionMemory.must_have),
      renderStringList('must_not', decisionMemory.must_not),
      renderStringList('accepted_changes', decisionMemory.accepted_changes),
      renderStringList('rejected_changes', decisionMemory.rejected_changes),
      renderStringList('pending_tasks', decisionMemory.pending_tasks),
    ].join('\n'),
  );

export const renderConversationSummaryBlock = (summaryText: string) =>
  renderBlock('CONVERSATION SUMMARY', summaryText || '无');

export const renderRecentMessagesBlock = (
  messages: SanitizedHistoryMessage[],
) =>
  renderBlock(
    'RECENT MESSAGES',
    messages.length > 0
      ? messages
          .map((message) => `${message.role}: ${message.content}`)
          .join('\n')
      : '无历史消息',
  );

export const renderQuestionnaireOutlineBlock = (
  outline: QuestionnaireOutline,
) =>
  renderBlock(
    'QUESTIONNAIRE OUTLINE',
    [
      `title: ${outline.title}`,
      `description: ${outline.description || '无'}`,
      `footerText: ${outline.footerText || '无'}`,
      `componentCount: ${outline.componentCount}`,
      outline.components.length > 0
        ? outline.components
            .map(
              (component, index) =>
                `第${index + 1}题 | fe_id=${component.fe_id} | type=${component.type} | title=${component.title}`,
            )
            .join('\n')
        : '当前问卷没有题目',
    ].join('\n'),
  );

const renderFocusedSliceList = (
  title: string,
  components: FocusedSlice['neighbors'] | FocusedSlice['referenced'],
) =>
  `${title}：${
    components.length > 0
      ? components
          .map(
            (component) =>
              `第${component.questionNumber}题 | fe_id=${component.fe_id} | type=${component.type} | title=${component.title} | props=${JSON.stringify(component.props)}`,
          )
          .join('\n')
      : '无'
  }`;

export const renderFocusedSliceBlock = (focusedSlice: FocusedSlice | null) =>
  renderBlock(
    'FOCUSED SLICE',
    focusedSlice
      ? [
          focusedSlice.focused
            ? `当前选中题：第${focusedSlice.focused.questionNumber}题 | fe_id=${focusedSlice.focused.fe_id} | type=${focusedSlice.focused.type} | title=${focusedSlice.focused.title} | props=${JSON.stringify(focusedSlice.focused.props)}`
            : '当前选中题：无',
          renderFocusedSliceList('相邻题', focusedSlice.neighbors),
          renderFocusedSliceList('指令引用题', focusedSlice.referenced),
        ].join('\n')
      : '当前不是 edit 模式，无 focused slice',
  );
