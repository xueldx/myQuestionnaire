import OpenAI from 'openai';
import {
  CopilotWorkflowStage,
  DraftSummary,
  QuestionnaireDraft,
} from '@/service/ai/dto/copilot-stream.dto';
import { SanitizedCopilotDto } from '@/service/ai/ai-copilot-sanitize';
import { UserToken } from '@/common/decorators/current-user.decorator';
import { buildCopilotLatestBatchState } from '@/service/ai/ai-copilot-checkpoint';
import {
  getFocusedQuestionBinding,
  getReferencedQuestionBindings,
} from '@/service/ai/utils/question-reference';
import {
  AiMessageKind,
  AiMessageRole,
} from '@/service/ai/ai-conversation-helpers';

export type ModelRuntimeConfig = {
  model: string;
  apiKey: string;
  baseURL: string;
};

type PersistConversationMessageDeps = {
  persistConversationMessage: (params: {
    conversationId: number;
    role: AiMessageRole;
    kind?: AiMessageKind;
    content: string;
    toolName?: string | null;
    meta?: Record<string, any> | null;
  }) => Promise<any>;
};

export type PrepareCopilotRequestContextDeps =
  PersistConversationMessageDeps & {
    openai: OpenAI;
    defaultModel: string;
    sanitizeCopilotDto: (dto: any) => SanitizedCopilotDto;
    ensureQuestionnaireAccess: (
      questionnaireId: number,
      userId: number,
    ) => Promise<any>;
    resolveModelSelection: (modelName?: string) => {
      key: string;
      config: ModelRuntimeConfig;
    };
    createClientForModel: (modelName: string) => OpenAI;
    createRequestId: () => string;
    resolveCopilotConversation: (
      dto: SanitizedCopilotDto,
      userId: number,
    ) => Promise<any>;
    loadConversationHistory: (
      conversationId: number,
    ) => Promise<Array<Pick<any, 'role' | 'content'>>>;
    sanitizeConversationHistory: (
      messages: Array<Pick<any, 'role' | 'content'>>,
    ) => Array<{ role: 'user' | 'assistant'; content: string }>;
    pickConversationTitle: (title?: string, fallbackText?: string) => string;
    saveConversation: (conversation: any) => Promise<any>;
  };

export type PreparedCopilotRequestContext = {
  safeDto: SanitizedCopilotDto;
  workflowStage: CopilotWorkflowStage;
  resolvedModel: {
    key: string;
    config: ModelRuntimeConfig;
  };
  client: OpenAI;
  requestId: string;
  conversation: any;
};

export const getWorkflowStage = (
  dto: SanitizedCopilotDto,
): CopilotWorkflowStage => {
  if (dto.intent === 'edit') return 'edit';
  return dto.generateStage;
};

export const prepareCopilotRequestContext = async (
  deps: PrepareCopilotRequestContextDeps,
  dto: any,
  user: UserToken,
): Promise<PreparedCopilotRequestContext> => {
  const safeDto = deps.sanitizeCopilotDto(dto);
  await deps.ensureQuestionnaireAccess(safeDto.questionnaireId, user.userId);

  if (!safeDto.instruction) {
    throw new Error('请输入本轮 AI 指令后再发送');
  }
  if (
    safeDto.intent === 'edit' &&
    !getFocusedQuestionBinding(
      safeDto.focusedComponentId,
      safeDto.questionnaire.components || [],
    )
  ) {
    throw new Error('当前仅支持单题 AI 修改，请先选中要修改的题目');
  }
  if (safeDto.intent === 'edit') {
    const focusedBinding = getFocusedQuestionBinding(
      safeDto.focusedComponentId,
      safeDto.questionnaire.components || [],
    );
    const referencedBindings = getReferencedQuestionBindings(
      safeDto.instruction,
      safeDto.questionnaire.components || [],
    );

    if (
      focusedBinding &&
      referencedBindings.some(
        (binding) => binding.fe_id !== focusedBinding.fe_id,
      )
    ) {
      throw new Error(
        '当前选中的题目与指令里引用的题目不一致，请重新确认后再试',
      );
    }
  }
  if (
    safeDto.intent === 'generate' &&
    safeDto.generateStage === 'generate' &&
    !safeDto.originalInstruction
  ) {
    safeDto.originalInstruction = safeDto.instruction;
  }

  const workflowStage = getWorkflowStage(safeDto);
  const resolvedModel = deps.resolveModelSelection(safeDto.model);
  const client =
    resolvedModel.key === deps.defaultModel
      ? deps.openai
      : deps.createClientForModel(resolvedModel.key);
  const requestId = deps.createRequestId();
  const conversation = await deps.resolveCopilotConversation(
    safeDto,
    user.userId,
  );
  const conversationHistory = await deps.loadConversationHistory(
    conversation.id,
  );

  safeDto.history =
    conversationHistory.length > 0
      ? deps.sanitizeConversationHistory(conversationHistory)
      : safeDto.history;

  return {
    safeDto,
    workflowStage,
    resolvedModel,
    client,
    requestId,
    conversation,
  };
};

export const initializeCopilotConversationState = async (
  deps: Pick<
    PrepareCopilotRequestContextDeps,
    'pickConversationTitle' | 'saveConversation' | 'persistConversationMessage'
  >,
  params: {
    conversation: any;
    safeDto: SanitizedCopilotDto;
    workflowStage: CopilotWorkflowStage;
    requestId: string;
    resolvedModelKey: string;
    defaultConversationTitle: string;
    backgroundRunning: boolean;
  },
) => {
  const {
    conversation,
    safeDto,
    workflowStage,
    requestId,
    resolvedModelKey,
    defaultConversationTitle,
    backgroundRunning,
  } = params;

  conversation.intent = safeDto.intent;
  conversation.last_model = resolvedModelKey;
  conversation.last_instruction = safeDto.instruction;
  conversation.last_runtime_status =
    backgroundRunning && workflowStage !== 'polish'
      ? 'background_running'
      : workflowStage === 'polish'
        ? 'polishing'
        : 'connecting';
  conversation.last_workflow_stage = workflowStage;
  conversation.latest_draft = null;
  conversation.latest_summary = null;
  conversation.latest_base_questionnaire = safeDto.questionnaire;
  conversation.latest_batches = buildCopilotLatestBatchState({
    requestId,
    safeDto,
    conversation,
    workflowStage,
    runtimeStatus: conversation.last_runtime_status,
    draft: null as QuestionnaireDraft | null,
    summary: null as DraftSummary | null,
  });
  conversation.latest_activity_at = new Date();
  if (conversation.title === defaultConversationTitle) {
    conversation.title = deps.pickConversationTitle(
      undefined,
      safeDto.originalInstruction || safeDto.instruction,
    );
  }
  await deps.saveConversation(conversation);

  await deps.persistConversationMessage({
    conversationId: conversation.id,
    role: 'user',
    kind: 'chat',
    content:
      safeDto.intent === 'generate' && safeDto.generateStage === 'polish'
        ? `润色：${safeDto.instruction}`
        : safeDto.instruction,
    meta: {
      requestId,
      stage: workflowStage,
    },
  });
};
