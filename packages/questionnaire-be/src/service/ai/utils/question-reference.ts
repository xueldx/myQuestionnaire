import { QuestionComponent } from '@/common/schemas/question-detail.schema';

const QUESTION_REFERENCE_REGEXP =
  /第\s*([0-9]+|[零〇一二两三四五六七八九十]+)\s*题/g;

const ADDITION_KEYWORD_REGEXP =
  /(新增|添加|追加|补充|再补|再加|再来一题|加一题|补一题|插入|增加一题|增加一个问题|补一个问题)/;

const CHINESE_DIGIT_MAP: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

const parseChineseQuestionNumber = (token: string) => {
  if (!token) return null;
  if (/^\d+$/.test(token)) return Number(token);
  if (token === '十') return 10;

  const [tensPart, onesPart] = token.split('十');
  if (token.includes('十')) {
    const tens =
      tensPart === ''
        ? 1
        : CHINESE_DIGIT_MAP[tensPart] ?? null;
    const ones =
      onesPart === ''
        ? 0
        : CHINESE_DIGIT_MAP[onesPart] ?? null;

    if (tens == null || ones == null) return null;
    return tens * 10 + ones;
  }

  const digit = CHINESE_DIGIT_MAP[token];
  return typeof digit === 'number' ? digit : null;
};

const normalizeId = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

export const extractReferencedQuestionNumbers = (instruction: string) => {
  const normalizedInstruction = instruction.trim();
  if (!normalizedInstruction) return [];

  const referencedNumbers: number[] = [];
  const seenNumbers = new Set<number>();

  for (const match of normalizedInstruction.matchAll(QUESTION_REFERENCE_REGEXP)) {
    const rawToken = match[1]?.trim() || '';
    const parsedNumber = parseChineseQuestionNumber(rawToken);

    if (!parsedNumber || parsedNumber <= 0 || seenNumbers.has(parsedNumber)) {
      continue;
    }

    seenNumbers.add(parsedNumber);
    referencedNumbers.push(parsedNumber);
  }

  return referencedNumbers;
};

export const getReferencedQuestionBindings = (
  instruction: string,
  snapshotComponents: QuestionComponent[],
) =>
  extractReferencedQuestionNumbers(instruction)
    .map(questionNumber => {
      const component = snapshotComponents[questionNumber - 1];
      if (!component) return null;

      return {
        questionNumber,
        fe_id: component.fe_id,
        title: component.title,
      };
    })
    .filter(Boolean) as Array<{
    questionNumber: number;
    fe_id: string;
    title: string;
  }>;

export const instructionAllowsAdditions = (instruction: string) =>
  ADDITION_KEYWORD_REGEXP.test(instruction);

export const getFocusedQuestionBinding = (
  focusedComponentId: string | null | undefined,
  snapshotComponents: QuestionComponent[],
) => {
  const normalizedId = normalizeId(focusedComponentId);
  if (!normalizedId) return null;

  const componentIndex = snapshotComponents.findIndex(
    (component) => normalizeId(component.fe_id) === normalizedId,
  );
  if (componentIndex < 0) return null;

  const component = snapshotComponents[componentIndex];
  return {
    questionNumber: componentIndex + 1,
    fe_id: component.fe_id,
    title: component.title,
  };
};

export const buildQuestionReferenceMapText = (
  snapshotComponents: QuestionComponent[],
) => {
  if (snapshotComponents.length === 0) return '当前问卷为空，无题号映射。';

  return snapshotComponents
    .map(
      (component, index) =>
        `第${index + 1}题 -> fe_id=${component.fe_id} -> 标题=${component.title}`,
    )
    .join('\n');
};
