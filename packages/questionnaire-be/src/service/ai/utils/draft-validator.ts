import {
  QuestionnaireDraft,
  QuestionnaireSnapshot,
} from '@/service/ai/dto/copilot-stream.dto';

export const SUPPORTED_COMPONENT_TYPES = new Set([
  'questionShortAnswer',
  'questionRadio',
  'questionCheckbox',
  'questionParagraph',
  'questionDropdown',
  'questionRating',
  'questionNPS',
  'questionMatrixRadio',
  'questionMatrixCheckbox',
  'questionSlider',
  'questionDate',
  'questionTitle',
]);

const PLACEHOLDER_TITLES = new Set([
  '未命名问卷',
  '未命名题目',
  '未命名组件',
  '标题',
  '一段说明文字',
  '简答题',
  '这是一道单选题',
  '这是一道多选题',
  '这是一道下拉选择题',
  '这是一道评分题',
  '这是一道NPS评分题',
  '这是一道矩阵单选题',
  '这是一道矩阵多选题',
  '这是一道滑块题',
  '这是一道日期题',
]);

const INVALID_TITLE_PATTERN = /^[\d\s.、，,。．()（）-]+$/;

const isWeakTitle = (title: string) => {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return true;
  if (PLACEHOLDER_TITLES.has(trimmedTitle)) return true;
  return INVALID_TITLE_PATTERN.test(trimmedTitle);
};

export type ValidateDraftResult = {
  draft: QuestionnaireDraft;
  warnings: string[];
};

export const validateDraft = (
  draft: QuestionnaireDraft,
  snapshot: QuestionnaireSnapshot,
  intent: 'generate' | 'edit',
): ValidateDraftResult => {
  if (!draft.title?.trim()) {
    throw new Error('AI 草稿缺少问卷标题');
  }

  if (!Array.isArray(draft.components) || draft.components.length === 0) {
    throw new Error('AI 草稿中没有可用组件');
  }

  if (
    intent === 'generate' &&
    snapshot.components.length === 0 &&
    (isWeakTitle(draft.title) || !draft.description?.trim())
  ) {
    throw new Error('空白问卷生成时，AI 必须给出有效的问卷标题和描述');
  }

  const idSet = new Set<string>();
  const warnings: string[] = [];
  const validComponents = draft.components.filter((component, index) => {
    if (!component.fe_id?.trim()) {
      warnings.push(`第 ${index + 1} 个组件缺少 fe_id，已跳过`);
      return false;
    }

    if (idSet.has(component.fe_id)) {
      warnings.push(`组件 fe_id 重复: ${component.fe_id}，已跳过`);
      return false;
    }

    if (!SUPPORTED_COMPONENT_TYPES.has(component.type)) {
      warnings.push(
        `第 ${index + 1} 个组件类型不支持: ${component.type}，已跳过`,
      );
      return false;
    }

    if (!component.title?.trim()) {
      warnings.push(`第 ${index + 1} 个组件缺少标题，已跳过`);
      return false;
    }

    if (isWeakTitle(component.title)) {
      warnings.push(`第 ${index + 1} 个组件标题不合法，已跳过`);
      return false;
    }

    idSet.add(component.fe_id);
    return true;
  });

  if (validComponents.length === 0) {
    throw new Error('所有组件均校验失败，无可用内容。请重试或调整指令。');
  }

  return {
    draft: { ...draft, components: validComponents },
    warnings,
  };
};
