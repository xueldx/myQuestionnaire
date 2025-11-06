import {
  QuestionnaireDraft,
  QuestionnaireSnapshot,
} from '@/service/ai/dto/copilot-stream.dto';
import { ParsedCopilotBlocks } from '@/service/ai/utils/parse-copilot-blocks';
import { QuestionComponent } from '@/common/schemas/question-detail.schema';

const ensureString = (value: unknown, fallback = '') => {
  return typeof value === 'string' ? value.trim() : fallback;
};

const normalizeStringList = (value: unknown, fallback: string[] = []) => {
  if (!Array.isArray(value)) return [...fallback];

  const displayKeys = ['label', 'text', 'value', 'title', 'content', 'name'];
  const normalized = value
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (typeof item === 'number' || typeof item === 'boolean') {
        return String(item);
      }

      if (item && typeof item === 'object' && !Array.isArray(item)) {
        for (const key of displayKeys) {
          const candidate = (item as Record<string, unknown>)[key];
          if (typeof candidate === 'string') return candidate.trim();
          if (typeof candidate === 'number' || typeof candidate === 'boolean') {
            return String(candidate);
          }
        }
      }

      return '';
    })
    .filter(Boolean);

  return normalized.length > 0 ? normalized : [...fallback];
};

const ensureObject = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, any>;
};

const createFallbackId = (intent: 'generate' | 'edit', index: number) => {
  return `${intent}-${Date.now()}-${index + 1}`;
};

const normalizeComponent = (
  component: QuestionComponent,
  intent: 'generate' | 'edit',
  index: number,
): QuestionComponent => {
  const props = ensureObject(component.props);
  const title = ensureString(
    component.title,
    ensureString(props.title, '未命名题目'),
  );
  const nextProps: Record<string, any> = {
    ...props,
    title,
  };

  if (
    component.type === 'questionRadio' ||
    component.type === 'questionCheckbox' ||
    component.type === 'questionDropdown'
  ) {
    nextProps.options = normalizeStringList(nextProps.options);
  }

  if (
    component.type === 'questionMatrixRadio' ||
    component.type === 'questionMatrixCheckbox'
  ) {
    nextProps.rows = normalizeStringList(nextProps.rows);
    nextProps.columns = normalizeStringList(nextProps.columns);
  }

  return {
    fe_id: ensureString(component.fe_id, createFallbackId(intent, index)),
    type: ensureString(component.type),
    title,
    props: nextProps,
  };
};

const mergeEditComponents = (
  snapshotComponents: QuestionComponent[],
  normalizedComponents: QuestionComponent[],
) => {
  if (snapshotComponents.length === 0) return normalizedComponents;

  const snapshotIndexMap = new Map(
    snapshotComponents.map((component, index) => [component.fe_id, index]),
  );
  const merged: QuestionComponent[] = [];
  const seenIds = new Set<string>();
  let snapshotCursor = 0;

  normalizedComponents.forEach((component) => {
    const matchedIndex = snapshotIndexMap.get(component.fe_id);

    if (typeof matchedIndex === 'number') {
      while (snapshotCursor < matchedIndex) {
        const sourceComponent = snapshotComponents[snapshotCursor];
        if (!seenIds.has(sourceComponent.fe_id)) {
          merged.push(sourceComponent);
          seenIds.add(sourceComponent.fe_id);
        }
        snapshotCursor += 1;
      }

      if (seenIds.has(component.fe_id)) {
        const existingIndex = merged.findIndex(
          (item) => item.fe_id === component.fe_id,
        );
        if (existingIndex >= 0) {
          merged[existingIndex] = component;
        }
      } else {
        merged.push(component);
        seenIds.add(component.fe_id);
      }

      snapshotCursor = Math.max(snapshotCursor, matchedIndex + 1);
      return;
    }

    merged.push(component);
  });

  while (snapshotCursor < snapshotComponents.length) {
    const sourceComponent = snapshotComponents[snapshotCursor];
    if (!seenIds.has(sourceComponent.fe_id)) {
      merged.push(sourceComponent);
      seenIds.add(sourceComponent.fe_id);
    }
    snapshotCursor += 1;
  }

  return merged;
};

export const normalizeDraft = (
  parsed: ParsedCopilotBlocks,
  snapshot: QuestionnaireSnapshot,
  intent: 'generate' | 'edit',
): QuestionnaireDraft => {
  const pageConfig = ensureObject(parsed.pageConfig);
  const fallbackTitle =
    intent === 'edit' ? snapshot.title || '未命名问卷' : '未命名问卷';
  const fallbackDescription =
    intent === 'edit' ? snapshot.description || '' : '';
  const fallbackFooterText = intent === 'edit' ? snapshot.footerText || '' : '';
  const normalizedComponents = parsed.components.map((component, index) =>
    normalizeComponent(component, intent, index),
  );
  const finalComponents =
    intent === 'edit'
      ? mergeEditComponents(snapshot.components || [], normalizedComponents)
      : normalizedComponents;

  return {
    title: ensureString(pageConfig.title, fallbackTitle),
    description: ensureString(pageConfig.description, fallbackDescription),
    footerText: ensureString(pageConfig.footerText, fallbackFooterText),
    components: finalComponents,
  };
};
