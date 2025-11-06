import { QuestionComponent } from '@/common/schemas/question-detail.schema';

const ASSISTANT_START = '<<<ASSISTANT_REPLY>>>';
const ASSISTANT_END = '<<<END_ASSISTANT_REPLY>>>';
const PAGE_CONFIG_START = '<<<PAGE_CONFIG>>>';
const PAGE_CONFIG_END = '<<<END_PAGE_CONFIG>>>';
const COMPONENT_START = '<<<COMPONENT>>>';
const COMPONENT_END = '<<<END_COMPONENT>>>';
const END_DRAFT = '<<<END_DRAFT>>>';

type BlockResult = {
  content: string;
  complete: boolean;
};

export type ParsedCopilotBlocks = {
  assistantReply: string;
  pageConfig: Record<string, any> | null;
  components: QuestionComponent[];
  endDraftReached: boolean;
  errors: string[];
  warnings: string[];
};

const getBlockContent = (
  source: string,
  startMarker: string,
  endMarker: string,
): BlockResult | null => {
  const startIndex = source.indexOf(startMarker);
  if (startIndex < 0) return null;

  const contentStart = startIndex + startMarker.length;
  const endIndex = source.indexOf(endMarker, contentStart);

  if (endIndex < 0) {
    return {
      content: source.slice(contentStart).trim(),
      complete: false,
    };
  }

  return {
    content: source.slice(contentStart, endIndex).trim(),
    complete: true,
  };
};

const getFallbackAssistantReply = (source: string) => {
  const endDraftIndex = source.indexOf(END_DRAFT);
  if (endDraftIndex >= 0) {
    return source.slice(endDraftIndex + END_DRAFT.length).trim();
  }

  const indexes = [
    source.indexOf(PAGE_CONFIG_START),
    source.indexOf(COMPONENT_START),
  ].filter((index) => index >= 0);

  if (indexes.length === 0) {
    return source.trim();
  }

  return source.slice(0, Math.min(...indexes)).trim();
};

const safeParseJson = <T>(
  text: string,
  label: string,
  target: string[],
): T | null => {
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    target.push(`${label} JSON 解析失败`);
    return null;
  }
};

export const parseCopilotBlocks = (source: string): ParsedCopilotBlocks => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const assistantBlock = getBlockContent(
    source,
    ASSISTANT_START,
    ASSISTANT_END,
  );
  const pageConfigBlock = getBlockContent(
    source,
    PAGE_CONFIG_START,
    PAGE_CONFIG_END,
  );

  const components: QuestionComponent[] = [];
  let searchIndex = 0;

  while (searchIndex < source.length) {
    const startIndex = source.indexOf(COMPONENT_START, searchIndex);
    if (startIndex < 0) break;

    const contentStart = startIndex + COMPONENT_START.length;
    const endIndex = source.indexOf(COMPONENT_END, contentStart);
    if (endIndex < 0) break;

    const blockContent = source.slice(contentStart, endIndex).trim();
    const component = safeParseJson<QuestionComponent>(
      blockContent,
      `COMPONENT #${components.length + warnings.length + 1}`,
      warnings,
    );

    if (component) {
      components.push(component);
    }

    searchIndex = endIndex + COMPONENT_END.length;
  }

  const pageConfig =
    pageConfigBlock && pageConfigBlock.complete && pageConfigBlock.content
      ? safeParseJson<Record<string, any>>(
          pageConfigBlock.content,
          'PAGE_CONFIG',
          errors,
        )
      : null;

  return {
    assistantReply:
      assistantBlock?.content ?? getFallbackAssistantReply(source) ?? '',
    pageConfig,
    components,
    endDraftReached: source.includes(END_DRAFT),
    errors,
    warnings,
  };
};
