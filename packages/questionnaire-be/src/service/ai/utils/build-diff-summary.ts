import {
  DraftSummary,
  QuestionnaireDraft,
  QuestionnaireSnapshot,
} from '@/service/ai/dto/copilot-stream.dto';

const getComponentLabel = (component: {
  title?: string;
  type?: string;
  fe_id?: string;
}) => {
  return component.title || component.type || component.fe_id || '未命名组件';
};

const isComponentChanged = (
  prev: QuestionnaireSnapshot['components'][number],
  next: QuestionnaireDraft['components'][number],
) => {
  return (
    prev.title !== next.title ||
    prev.type !== next.type ||
    JSON.stringify(prev.props || {}) !== JSON.stringify(next.props || {})
  );
};

export const buildDiffSummary = (
  snapshot: QuestionnaireSnapshot,
  draft: QuestionnaireDraft,
  intent: 'generate' | 'edit',
): DraftSummary => {
  if (intent === 'generate') {
    return {
      added: draft.components.map((component) => getComponentLabel(component)),
      updated: [],
      deleted: [],
    };
  }

  const sourceMap = new Map(
    snapshot.components.map((component) => [component.fe_id, component]),
  );
  const draftMap = new Map(
    draft.components.map((component) => [component.fe_id, component]),
  );

  const added = draft.components
    .filter((component) => !sourceMap.has(component.fe_id))
    .map((component) => getComponentLabel(component));
  const deleted = snapshot.components
    .filter((component) => !draftMap.has(component.fe_id))
    .map((component) => getComponentLabel(component));
  const updated = draft.components
    .filter((component) => {
      const source = sourceMap.get(component.fe_id);
      return source ? isComponentChanged(source, component) : false;
    })
    .map((component) => getComponentLabel(component));

  if (
    snapshot.title !== draft.title ||
    snapshot.description !== draft.description ||
    snapshot.footerText !== draft.footerText
  ) {
    updated.unshift('问卷标题/描述/页脚');
  }

  return {
    added: Array.from(new Set(added)),
    updated: Array.from(new Set(updated)),
    deleted: Array.from(new Set(deleted)),
  };
};
