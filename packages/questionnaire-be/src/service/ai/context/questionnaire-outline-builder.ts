import {
  QuestionnaireOutline,
  QuestionnaireSnapshotLike,
} from '@/service/ai/context/context-types';

export const buildQuestionnaireOutline = (
  questionnaire: QuestionnaireSnapshotLike,
): QuestionnaireOutline => ({
  title: questionnaire.title,
  description: questionnaire.description,
  footerText: questionnaire.footerText,
  componentCount: questionnaire.components.length,
  components: questionnaire.components.map((component) => ({
    fe_id: component.fe_id,
    type: component.type,
    title: component.title,
  })),
});
