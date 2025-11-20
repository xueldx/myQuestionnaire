import {
  CopilotGenerateStage,
  CopilotStreamDto,
} from '@/service/ai/dto/copilot-stream.dto';

export type SanitizedCopilotDto = CopilotStreamDto & {
  generateStage: CopilotGenerateStage;
  originalInstruction: string;
};

export const ensureString = (value: unknown, fallback = '') => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return fallback;
};

export const ensureObject = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, any>;
};

export const normalizeStringList = (
  value: unknown,
  fallback: string[] = [],
) => {
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

export const normalizeComponentProps = (
  type: string,
  props: Record<string, any>,
) => {
  const nextProps = { ...props };

  if (
    type === 'questionRadio' ||
    type === 'questionCheckbox' ||
    type === 'questionDropdown'
  ) {
    nextProps.options = normalizeStringList(nextProps.options);
  }

  if (type === 'questionMatrixRadio' || type === 'questionMatrixCheckbox') {
    nextProps.rows = normalizeStringList(nextProps.rows);
    nextProps.columns = normalizeStringList(nextProps.columns);
  }

  return nextProps;
};

export const sanitizeCopilotDto = (dto: CopilotStreamDto): SanitizedCopilotDto => {
  const snapshot = ensureObject(dto?.questionnaire);
  const rawComponents = Array.isArray(snapshot.components)
    ? snapshot.components
    : [];

  return {
    intent: dto?.intent === 'edit' ? 'edit' : 'generate',
    generateStage:
      dto?.intent === 'generate' && dto?.generateStage === 'polish'
        ? 'polish'
        : 'generate',
    questionnaireId: Number(dto?.questionnaireId) || 0,
    baseVersion: Math.max(1, Number(dto?.baseVersion) || 1),
    model: ensureString(dto?.model) || undefined,
    instruction: ensureString(dto?.instruction),
    originalInstruction: ensureString(dto?.originalInstruction),
    history: Array.isArray(dto?.history)
      ? dto.history
          .map((item) => ({
            role:
              item?.role === 'assistant'
                ? ('assistant' as const)
                : ('user' as const),
            content: ensureString(item?.content),
          }))
          .filter((item) => item.content)
      : [],
    questionnaire: {
      title: ensureString(snapshot.title, '未命名问卷'),
      description: ensureString(snapshot.description),
      footerText: ensureString(snapshot.footerText),
      components: rawComponents
        .map((component, index) => {
          const componentRecord = ensureObject(component);
          const type = ensureString(componentRecord.type);
          if (!type) return null;

          const props = normalizeComponentProps(
            type,
            ensureObject(componentRecord.props),
          );
          const title =
            ensureString(componentRecord.title) ||
            ensureString(props.title) ||
            `${type}-${index + 1}`;

          return {
            fe_id: ensureString(componentRecord.fe_id, `${type}-${index + 1}`),
            type,
            title,
            props: {
              ...props,
              title,
            },
          };
        })
        .filter(Boolean) as SanitizedCopilotDto['questionnaire']['components'],
    },
  };
};
