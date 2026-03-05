import { SanitizedCopilotDto } from '@/service/ai/ai-copilot-sanitize';
import { getReferencedQuestionBindings } from '@/service/ai/utils/question-reference';
import {
  FocusedSlice,
  FocusedSliceComponent,
} from '@/service/ai/context/context-types';

const createSliceComponent = (
  component: SanitizedCopilotDto['questionnaire']['components'][number],
  index: number,
): FocusedSliceComponent => ({
  questionNumber: index + 1,
  fe_id: component.fe_id,
  type: component.type,
  title: component.title,
  props: component.props || {},
});

export const buildFocusedSlice = (
  dto: SanitizedCopilotDto,
): FocusedSlice | null => {
  if (dto.intent !== 'edit') return null;

  const components = dto.questionnaire.components || [];
  const focusedIndex = components.findIndex(
    (component) => component.fe_id === dto.focusedComponentId,
  );
  const focused =
    focusedIndex >= 0
      ? createSliceComponent(components[focusedIndex], focusedIndex)
      : null;

  const neighbors = [focusedIndex - 1, focusedIndex + 1]
    .filter((index) => index >= 0 && index < components.length)
    .map((index) => createSliceComponent(components[index], index));

  const referencedBindings = getReferencedQuestionBindings(
    dto.instruction,
    components,
  );
  const referencedSeen = new Set<string>();
  const referenced = referencedBindings
    .map((binding) => {
      if (!binding.fe_id || referencedSeen.has(binding.fe_id)) return null;
      referencedSeen.add(binding.fe_id);
      const index = components.findIndex(
        (component) => component.fe_id === binding.fe_id,
      );
      if (index < 0) return null;
      return createSliceComponent(components[index], index);
    })
    .filter(Boolean)
    .filter(
      (component) =>
        component &&
        component.fe_id !== focused?.fe_id &&
        !neighbors.some((item) => item.fe_id === component.fe_id),
    ) as FocusedSliceComponent[];

  return {
    focused,
    neighbors,
    referenced,
  };
};
