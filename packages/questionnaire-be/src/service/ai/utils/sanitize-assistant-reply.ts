const PROTOCOL_MARKER_PATTERN =
  /<{0,3}(?:END_)?(?:PAGE_CONFIG|COMPONENT|ASSISTANT_REPLY|END_DRAFT)(?:>{0,3})?/g;

export const sanitizeAssistantReply = (content: string) =>
  content
    .replace(/\r/g, '')
    .replace(PROTOCOL_MARKER_PATTERN, '')
    .replace(/<<<(?:END_)?[A-Z_]+>>>/g, '')
    .replace(/<<<END_DRAFT>>>/g, '')
    .replace(/<<<[A-Z_]*$/gm, '')
    .replace(/<<<END_[A-Z_]*$/gm, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/```/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
