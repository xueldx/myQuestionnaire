import {
  QuestionnaireDraft,
  QuestionnaireSnapshot,
} from '@/service/ai/dto/copilot-stream.dto';
import { ParsedCopilotBlocks } from '@/service/ai/utils/parse-copilot-blocks';
import {
  getFocusedQuestionBinding,
  getReferencedQuestionBindings,
} from '@/service/ai/utils/question-reference';
import { QuestionComponent } from '@/common/schemas/question-detail.schema';
import { v4 as uuidv4 } from 'uuid';

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
  return `question-${intent}-${index + 1}-${uuidv4()}`;
};

const claimGeneratedId = (
  intent: 'generate' | 'edit',
  usedIds: Set<string>,
  reservedIds: Set<string>,
  index: number,
) => {
  let candidate = createFallbackId(intent, index);

  while (usedIds.has(candidate) || reservedIds.has(candidate)) {
    candidate = createFallbackId(intent, index);
  }

  usedIds.add(candidate);
  return candidate;
};

const resolveUniqueDraftIds = (
  components: QuestionComponent[],
  snapshotComponents: QuestionComponent[],
  intent: 'generate' | 'edit',
  instruction = '',
  focusedComponentId = '',
) => {
  const snapshotIds = new Set(
    snapshotComponents.map((component) => ensureString(component.fe_id)).filter(Boolean),
  );
  const focusedBinding = getFocusedQuestionBinding(
    focusedComponentId,
    snapshotComponents,
  );
  const referencedBindings = getReferencedQuestionBindings(
    instruction,
    snapshotComponents,
  );
  const usedIds = new Set<string>();
  const matchedSnapshotIds = new Set<string>();
  const pendingReferencedIds = [
    ...(focusedBinding ? [focusedBinding.fe_id] : []),
    ...referencedBindings
      .map((binding) => binding.fe_id)
      .filter((fe_id) => fe_id !== focusedBinding?.fe_id),
  ];

  const claimReferencedId = () => {
    while (pendingReferencedIds.length > 0) {
      const nextId = pendingReferencedIds.shift();
      if (!nextId || matchedSnapshotIds.has(nextId)) continue;

      matchedSnapshotIds.add(nextId);
      usedIds.add(nextId);
      return nextId;
    }

    return null;
  };

  return components.map((component, index) => {
    const preferredId = ensureString(component.fe_id);

    if (
      intent === 'edit' &&
      preferredId &&
      snapshotIds.has(preferredId) &&
      (!focusedBinding || preferredId === focusedBinding.fe_id) &&
      !matchedSnapshotIds.has(preferredId)
    ) {
      matchedSnapshotIds.add(preferredId);
      usedIds.add(preferredId);
      return component;
    }

    if (intent === 'edit') {
      const referencedId = claimReferencedId();
      if (referencedId) {
        return {
          ...component,
          fe_id: referencedId,
        };
      }
    }

    if (preferredId && !usedIds.has(preferredId) && !snapshotIds.has(preferredId)) {
      usedIds.add(preferredId);
      return component;
    }

    const nextId = claimGeneratedId(intent, usedIds, snapshotIds, index);
    return {
      ...component,
      fe_id: nextId,
    };
  });
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
  instruction = '',
  focusedComponentId = '',
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
  const resolvedComponents = resolveUniqueDraftIds(
    normalizedComponents,
    snapshot.components || [],
    intent,
    instruction,
    focusedComponentId,
  );
  const finalComponents =
    intent === 'edit'
      ? mergeEditComponents(snapshot.components || [], resolvedComponents)
      : resolvedComponents;

  return {
    title: ensureString(pageConfig.title, fallbackTitle),
    description: ensureString(pageConfig.description, fallbackDescription),
    footerText: ensureString(pageConfig.footerText, fallbackFooterText),
    components: finalComponents,
  };
};
