import { QuestionnaireDraft } from '@/service/ai/dto/copilot-stream.dto';

export type DecisionMemory = {
  goal: string;
  audience: string;
  tone: string;
  must_have: string[];
  must_not: string[];
  accepted_changes: string[];
  rejected_changes: string[];
  pending_tasks: string[];
};

export type QuestionnaireOutlineComponent = {
  fe_id: string;
  type: string;
  title: string;
};

export type QuestionnaireOutline = {
  title: string;
  description: string;
  footerText: string;
  componentCount: number;
  components: QuestionnaireOutlineComponent[];
};

export type FocusedSliceComponent = QuestionnaireOutlineComponent & {
  questionNumber: number;
  props: Record<string, any>;
};

export type FocusedSlice = {
  focused: FocusedSliceComponent | null;
  neighbors: FocusedSliceComponent[];
  referenced: FocusedSliceComponent[];
};

export type SanitizedHistoryMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export const EMPTY_DECISION_MEMORY: DecisionMemory = {
  goal: '',
  audience: '',
  tone: '',
  must_have: [],
  must_not: [],
  accepted_changes: [],
  rejected_changes: [],
  pending_tasks: [],
};

export type QuestionnaireSnapshotLike = Pick<
  QuestionnaireDraft,
  'title' | 'description' | 'footerText' | 'components'
>;
