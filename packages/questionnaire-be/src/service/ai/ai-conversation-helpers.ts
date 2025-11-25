import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { In, Repository } from 'typeorm';
import AiConversation from '@/service/ai/entities/ai-conversation.entity';
import AiMessage from '@/service/ai/entities/ai-message.entity';
import AiAttachment from '@/service/ai/entities/ai-attachment.entity';
import Question from '@/service/question/entities/question.entity';
import {
  CreateConversationDto,
  UpdateConversationDto,
} from '@/service/ai/dto/conversation.dto';
import {
  DraftSummary,
  QuestionnaireDraft,
} from '@/service/ai/dto/copilot-stream.dto';
import { SanitizedCopilotDto } from '@/service/ai/ai-copilot-sanitize';

export type AiMessageRole = 'user' | 'assistant' | 'tool';
export type AiMessageKind = 'chat' | 'tool_call' | 'tool_result';

export type SerializedAiMessage = {
  id: number;
  role: AiMessageRole;
  kind: AiMessageKind;
  content: string;
  toolName: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;
};

export type SerializedAiConversationSummary = {
  id: number;
  questionnaireId: number;
  title: string;
  intent: 'generate' | 'edit';
  isPinned: boolean;
  lastModel: string | null;
  lastInstruction: string | null;
  messageCount: number;
  attachmentCount: number;
  latestActivityAt: string | null;
  updatedAt: string;
};

export type SerializedAiConversationDetail = SerializedAiConversationSummary & {
  latestDraft: QuestionnaireDraft | null;
  latestSummary: DraftSummary | null;
  messages: SerializedAiMessage[];
};

type ConversationHelperDeps = {
  aiConversationRepository: Repository<AiConversation>;
  aiMessageRepository: Repository<AiMessage>;
  aiAttachmentRepository: Repository<AiAttachment>;
  questionRepository: Repository<Question>;
  formatDate: (value: Date | null | undefined) => string | null;
  pickConversationTitle: (title?: string, fallbackText?: string) => string;
  resolveModelKey: (modelName?: string) => string;
  safeUnlink: (fileName: string | null | undefined) => Promise<void>;
};

type PersistConversationMessageParams = {
  conversationId: number;
  role: AiMessageRole;
  kind?: AiMessageKind;
  content: string;
  toolName?: string | null;
  meta?: Record<string, any> | null;
};

export const serializeConversation = (
  deps: ConversationHelperDeps,
  conversation: AiConversation,
): SerializedAiConversationSummary => ({
  id: conversation.id,
  questionnaireId: conversation.questionnaire_id,
  title: conversation.title,
  intent: conversation.intent,
  isPinned: conversation.is_pinned,
  lastModel: conversation.last_model,
  lastInstruction: conversation.last_instruction,
  messageCount: conversation.message_count || 0,
  attachmentCount: conversation.attachment_count || 0,
  latestActivityAt: deps.formatDate(conversation.latest_activity_at),
  updatedAt: conversation.update_time.toISOString(),
});

export const serializeMessage = (message: AiMessage): SerializedAiMessage => ({
  id: message.id,
  role: message.role,
  kind: message.kind,
  content: message.content,
  toolName: message.tool_name,
  metadata: message.meta || null,
  createdAt: message.create_time.toISOString(),
});

export const serializeConversationDetail = (
  deps: ConversationHelperDeps,
  conversation: AiConversation,
  messages: AiMessage[],
): SerializedAiConversationDetail => ({
  ...serializeConversation(deps, conversation),
  latestDraft: (conversation.latest_draft as QuestionnaireDraft | null) || null,
  latestSummary: (conversation.latest_summary as DraftSummary | null) || null,
  messages: messages.map((message) => serializeMessage(message)),
});

export const ensureQuestionnaireAccess = async (
  deps: ConversationHelperDeps,
  questionnaireId: number,
  userId: number,
) => {
  const questionnaire = await deps.questionRepository.findOneBy({
    id: questionnaireId,
  });

  if (!questionnaire || questionnaire.is_deleted) {
    throw new NotFoundException('问卷不存在或已被删除');
  }

  if (questionnaire.author_id !== userId) {
    throw new ForbiddenException('你没有权限访问当前问卷');
  }

  return questionnaire;
};

export const requireConversation = async (
  deps: ConversationHelperDeps,
  id: number,
  userId: number,
  options?: {
    withMessages?: boolean;
    withAttachments?: boolean;
  },
) => {
  const conversation = await deps.aiConversationRepository.findOneBy({
    id,
    user_id: userId,
  });

  if (!conversation) {
    throw new NotFoundException('会话不存在');
  }

  if (options?.withMessages) {
    conversation.messages = await deps.aiMessageRepository.find({
      where: {
        conversation_id: conversation.id,
      },
      order: {
        create_time: 'ASC',
      },
    });
  }

  if (options?.withAttachments) {
    conversation.attachments = await deps.aiAttachmentRepository.find({
      where: {
        conversation_id: conversation.id,
      },
      order: {
        create_time: 'DESC',
      },
    });
  }

  return conversation;
};

export const listConversations = async (
  deps: ConversationHelperDeps,
  questionnaireId: number,
  userId: number,
) => {
  await ensureQuestionnaireAccess(deps, questionnaireId, userId);
  const conversations = await deps.aiConversationRepository.find({
    where: {
      questionnaire_id: questionnaireId,
      user_id: userId,
    },
    order: {
      is_pinned: 'DESC',
      latest_activity_at: 'DESC',
      update_time: 'DESC',
    },
  });

  return conversations.map((conversation) =>
    serializeConversation(deps, conversation),
  );
};

export const createConversation = async (
  deps: ConversationHelperDeps,
  dto: CreateConversationDto,
  userId: number,
) => {
  const questionnaire = await ensureQuestionnaireAccess(
    deps,
    dto.questionnaireId,
    userId,
  );

  const conversation = deps.aiConversationRepository.create({
    questionnaire_id: questionnaire.id,
    user_id: userId,
    title: deps.pickConversationTitle(dto.title),
    intent: dto.intent === 'edit' ? 'edit' : 'generate',
    latest_activity_at: new Date(),
  });

  const saved = await deps.aiConversationRepository.save(conversation);
  return serializeConversationDetail(deps, saved, []);
};

export const getConversationDetail = async (
  deps: ConversationHelperDeps,
  id: number,
  userId: number,
) => {
  const conversation = await requireConversation(deps, id, userId, {
    withMessages: true,
  });

  return serializeConversationDetail(
    deps,
    conversation,
    conversation.messages || [],
  );
};

export const updateConversation = async (
  deps: ConversationHelperDeps,
  id: number,
  dto: UpdateConversationDto,
  userId: number,
) => {
  const conversation = await requireConversation(deps, id, userId);

  if (typeof dto.title === 'string') {
    conversation.title = deps.pickConversationTitle(dto.title);
  }

  if (typeof dto.isPinned === 'boolean') {
    conversation.is_pinned = dto.isPinned;
  }

  if (dto.intent === 'generate' || dto.intent === 'edit') {
    conversation.intent = dto.intent;
  }

  if (dto.lastInstruction !== undefined) {
    const normalizedInstruction =
      typeof dto.lastInstruction === 'string'
        ? dto.lastInstruction.trim()
        : null;
    conversation.last_instruction = normalizedInstruction || null;
  }

  if (dto.latestDraft !== undefined) {
    conversation.latest_draft = dto.latestDraft;
  }

  if (dto.latestSummary !== undefined) {
    conversation.latest_summary = dto.latestSummary;
  }

  const saved = await deps.aiConversationRepository.save(conversation);
  return serializeConversation(deps, saved);
};

export const deleteConversation = async (
  deps: ConversationHelperDeps,
  id: number,
  userId: number,
) => {
  const conversation = await requireConversation(deps, id, userId, {
    withAttachments: true,
  });

  const attachments = conversation.attachments || [];
  await Promise.all(
    attachments.map((attachment) => deps.safeUnlink(attachment.file_name)),
  );
  await deps.aiConversationRepository.remove(conversation);
};

export const findPreferredConversation = async (
  deps: ConversationHelperDeps,
  questionnaireId: number,
  userId: number,
) =>
  deps.aiConversationRepository.findOne({
    where: {
      questionnaire_id: questionnaireId,
      user_id: userId,
    },
    order: {
      is_pinned: 'DESC',
      latest_activity_at: 'DESC',
      update_time: 'DESC',
    },
  });

export const createConversationFromCopilotRequest = async (
  deps: ConversationHelperDeps,
  dto: SanitizedCopilotDto,
  userId: number,
) => {
  const conversation = deps.aiConversationRepository.create({
    questionnaire_id: dto.questionnaireId,
    user_id: userId,
    title: deps.pickConversationTitle(
      undefined,
      dto.originalInstruction || dto.instruction,
    ),
    intent: dto.intent,
    last_model: deps.resolveModelKey(dto.model),
    last_instruction: dto.instruction,
    latest_activity_at: new Date(),
  });

  return deps.aiConversationRepository.save(conversation);
};

export const resolveCopilotConversation = async (
  deps: ConversationHelperDeps,
  dto: SanitizedCopilotDto,
  userId: number,
) => {
  if (dto.conversationId) {
    const conversation = await requireConversation(
      deps,
      dto.conversationId,
      userId,
    );
    if (conversation.questionnaire_id !== dto.questionnaireId) {
      throw new ForbiddenException('会话与当前问卷不匹配');
    }
    return conversation;
  }

  const existingConversation = await findPreferredConversation(
    deps,
    dto.questionnaireId,
    userId,
  );
  if (existingConversation) {
    return existingConversation;
  }

  return createConversationFromCopilotRequest(deps, dto, userId);
};

export const loadConversationHistory = async (
  deps: ConversationHelperDeps,
  conversationId: number,
): Promise<Array<Pick<AiMessage, 'role' | 'content'>>> =>
  deps.aiMessageRepository.find({
    where: {
      conversation_id: conversationId,
      role: In(['user', 'assistant']),
    },
    order: {
      create_time: 'ASC',
    },
  });

export const persistConversationMessage = async (
  deps: ConversationHelperDeps,
  params: PersistConversationMessageParams,
) => {
  const message = deps.aiMessageRepository.create({
    conversation_id: params.conversationId,
    role: params.role,
    kind: params.kind || 'chat',
    content: params.content,
    tool_name: params.toolName || null,
    meta: params.meta || null,
  });

  const saved = await deps.aiMessageRepository.save(message);
  await deps.aiConversationRepository.update(params.conversationId, {
    message_count: await deps.aiMessageRepository.count({
      where: { conversation_id: params.conversationId },
    }),
    latest_activity_at: new Date(),
  });
  return saved;
};
