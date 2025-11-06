import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import OpenAI from 'openai';
import { Observable } from 'rxjs';
import configuration from '@/config';
import { AnswerService } from '@/service/answer/answer.service';
import { EditorService } from '@/service/editor/editor.service';
import {
  CopilotToolName,
  CopilotGenerateStage,
  CopilotRuntimePhase,
  CopilotStreamDto,
  CopilotWorkflowStage,
  DraftSummary,
  QuestionnaireDraft,
  QuestionnaireSnapshot,
} from '@/service/ai/dto/copilot-stream.dto';
import {
  initSseResponse,
  writeSseEvent,
} from '@/service/ai/utils/write-sse-event';
import { parseCopilotBlocks } from '@/service/ai/utils/parse-copilot-blocks';
import { normalizeDraft } from '@/service/ai/utils/draft-normalizer';
import { validateDraft } from '@/service/ai/utils/draft-validator';
import { buildDiffSummary } from '@/service/ai/utils/build-diff-summary';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import AiConversation from '@/service/ai/entities/ai-conversation.entity';
import AiMessage from '@/service/ai/entities/ai-message.entity';
import AiAttachment from '@/service/ai/entities/ai-attachment.entity';
import Question from '@/service/question/entities/question.entity';
import { UserToken } from '@/common/decorators/current-user.decorator';
import {
  CreateConversationDto,
  UpdateConversationDto,
} from '@/service/ai/dto/conversation.dto';
import { promises as fs } from 'fs';
import { join } from 'path';

enum Model {
  ModelScopeQwen3 = 'modelscope-qwen3-235b',
  ModelScopeGLM5 = 'modelscope-glm-5',
  ModelScopeKimik2 = 'modelscope-kimi-k2.5',
  // Glm4Flash = 'glm-4-flash',
  // QwenMax = 'qwen-max',
  // QwenPlus = 'qwen-plus',
  // DeepseekV3 = 'deepseek-v3',
}

interface ModelInfo {
  value: string;
  label: string;
  description: string;
}

interface ModelRuntimeConfig {
  model: string;
  apiKey: string;
  baseURL: string;
}

const MODEL_INFO_MAP: Record<Model, ModelInfo> = {
  [Model.ModelScopeQwen3]: {
    value: Model.ModelScopeQwen3,
    label: 'Qwen3',
    description: '魔搭社区 API Inference 接入的 Qwen3 235B 模型',
  },
  [Model.ModelScopeGLM5]: {
    value: Model.ModelScopeGLM5,
    label: 'GLM5',
    description: '魔搭社区 API Inference 接入的 GLM5 模型',
  },
  [Model.ModelScopeKimik2]: {
    value: Model.ModelScopeKimik2,
    label: 'KimiK2',
    description: '魔搭社区 API Inference 接入的 KimiK2 模型',
  },
  // [Model.Glm4Flash]: {
  //   value: Model.Glm4Flash,
  //   label: 'GLM',
  //   description: '智谱AI免费模型，速度快，适合日常使用',
  // },
  // [Model.QwenMax]: {
  //   value: Model.QwenMax,
  //   label: 'Qwen Max',
  //   description: '最强大的通义千问模型，支持复杂分析',
  // },
  // [Model.QwenPlus]: {
  //   value: Model.QwenPlus,
  //   label: 'Qwen Plus',
  //   description: '均衡的通义千问模型，速度更快',
  // },
  // [Model.DeepseekV3]: {
  //   value: Model.DeepseekV3,
  //   label: 'DeepSeek',
  //   description: 'DeepSeek最新模型，性能优异',
  // },
};

type AiMessageRole = 'user' | 'assistant' | 'tool';
type AiMessageKind = 'chat' | 'tool_call' | 'tool_result';

type SerializedAiMessage = {
  id: number;
  role: AiMessageRole;
  kind: AiMessageKind;
  content: string;
  toolName: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;
};

type SerializedAiConversationSummary = {
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

type SerializedAiConversationDetail = SerializedAiConversationSummary & {
  latestDraft: QuestionnaireDraft | null;
  latestSummary: DraftSummary | null;
  messages: SerializedAiMessage[];
};

type CopilotToolContextItem = {
  name: CopilotToolName;
  callId: string;
  summary: string;
  payload: unknown;
};

type SanitizedCopilotDto = CopilotStreamDto & {
  generateStage: CopilotGenerateStage;
  originalInstruction: string;
};

const COPILOT_STREAM_TIMEOUT_MS = 90000;
const DEFAULT_CONVERSATION_TITLE = '未命名会话';
const TOOL_CONTEXT_MAX_PREVIEW_LENGTH = 4000;

@Injectable()
export class AiService {
  // OpenAI 客户端实例
  private readonly openai: OpenAI;
  private readonly defaultModel: Model = Model.ModelScopeQwen3;

  constructor(
    private readonly answerService: AnswerService,
    private readonly editorService: EditorService,
    @InjectRepository(AiConversation)
    private readonly aiConversationRepository: Repository<AiConversation>,
    @InjectRepository(AiMessage)
    private readonly aiMessageRepository: Repository<AiMessage>,
    @InjectRepository(AiAttachment)
    private readonly aiAttachmentRepository: Repository<AiAttachment>,
    @InjectRepository(Question)
    private readonly questionRepository: Repository<Question>,
  ) {
    // 初始化 OpenAI 客户端，配置在使用时动态设置
    const defaultModelConfig = this.resolveModelSelection(
      this.defaultModel,
    ).config;
    this.openai = new OpenAI({
      baseURL: defaultModelConfig.baseURL,
      apiKey: defaultModelConfig.apiKey,
    });
  }

  private getConfiguredModelMap() {
    return (configuration().openai || {}) as Record<
      string,
      Partial<ModelRuntimeConfig>
    >;
  }

  private getModelRuntimeConfig(modelName: Model): ModelRuntimeConfig | null {
    const modelConfig = this.getConfiguredModelMap()[modelName];
    if (!modelConfig) return null;

    if (
      typeof modelConfig.model !== 'string' ||
      !modelConfig.model.trim() ||
      typeof modelConfig.apiKey !== 'string' ||
      !modelConfig.apiKey.trim() ||
      typeof modelConfig.baseURL !== 'string' ||
      !modelConfig.baseURL.trim()
    ) {
      return null;
    }

    return {
      model: modelConfig.model.trim(),
      apiKey: modelConfig.apiKey.trim(),
      baseURL: modelConfig.baseURL.trim(),
    };
  }

  private resolveModelSelection(modelName?: string): {
    key: Model;
    config: ModelRuntimeConfig;
  } {
    const availableModelKeys = Object.values(Model).filter((key) =>
      Boolean(this.getModelRuntimeConfig(key)),
    );

    const preferredModel =
      modelName && Object.values(Model).includes(modelName as Model)
        ? (modelName as Model)
        : undefined;
    const fallbackModel = availableModelKeys.includes(this.defaultModel)
      ? this.defaultModel
      : availableModelKeys[0];
    const selectedModel =
      preferredModel && availableModelKeys.includes(preferredModel)
        ? preferredModel
        : fallbackModel;

    if (!selectedModel) {
      throw new Error('当前未配置可用的大模型');
    }

    const modelConfig = this.getModelRuntimeConfig(selectedModel);
    if (!modelConfig) {
      throw new Error(`模型 ${selectedModel} 缺少有效配置`);
    }

    return {
      key: selectedModel,
      config: modelConfig,
    };
  }

  // 获取可用的AI模型列表
  getAvailableModels(): ModelInfo[] {
    return Object.values(Model)
      .filter((modelName) => Boolean(this.getModelRuntimeConfig(modelName)))
      .map((modelName) => MODEL_INFO_MAP[modelName]);
  }

  // 根据传入的模型创建OpenAI客户端
  private createClientForModel(modelName: string): OpenAI {
    const { config } = this.resolveModelSelection(modelName);

    return new OpenAI({
      baseURL: config.baseURL,
      apiKey: config.apiKey,
    });
  }

  private createRequestId() {
    return `copilot_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private createToolCallId(toolName: CopilotToolName) {
    return `${toolName}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private pickConversationTitle(title?: string, fallbackText?: string) {
    const trimmed = this.ensureString(title);
    if (trimmed) return trimmed.slice(0, 120);

    const normalizedFallback = this.ensureString(fallbackText);
    if (!normalizedFallback) return DEFAULT_CONVERSATION_TITLE;

    return normalizedFallback.slice(0, 32) || DEFAULT_CONVERSATION_TITLE;
  }

  private formatDate(value: Date | null | undefined) {
    return value ? value.toISOString() : null;
  }

  private serializeConversation(
    conversation: AiConversation,
  ): SerializedAiConversationSummary {
    return {
      id: conversation.id,
      questionnaireId: conversation.questionnaire_id,
      title: conversation.title,
      intent: conversation.intent,
      isPinned: conversation.is_pinned,
      lastModel: conversation.last_model,
      lastInstruction: conversation.last_instruction,
      messageCount: conversation.message_count || 0,
      attachmentCount: conversation.attachment_count || 0,
      latestActivityAt: this.formatDate(conversation.latest_activity_at),
      updatedAt: conversation.update_time.toISOString(),
    };
  }

  private serializeMessage(message: AiMessage): SerializedAiMessage {
    return {
      id: message.id,
      role: message.role,
      kind: message.kind,
      content: message.content,
      toolName: message.tool_name,
      metadata: message.meta || null,
      createdAt: message.create_time.toISOString(),
    };
  }

  private serializeConversationDetail(
    conversation: AiConversation,
    messages: AiMessage[],
  ): SerializedAiConversationDetail {
    return {
      ...this.serializeConversation(conversation),
      latestDraft:
        (conversation.latest_draft as QuestionnaireDraft | null) || null,
      latestSummary:
        (conversation.latest_summary as DraftSummary | null) || null,
      messages: messages.map((message) => this.serializeMessage(message)),
    };
  }

  private getStaticRootPath() {
    return join(process.cwd(), 'static');
  }

  private getAbsoluteFilePath(fileName: string) {
    return join(this.getStaticRootPath(), fileName);
  }

  private async safeUnlink(fileName: string | null | undefined) {
    if (!fileName) return;

    try {
      await fs.unlink(this.getAbsoluteFilePath(fileName));
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        console.error('删除 AI 附件文件失败:', error);
      }
    }
  }

  private truncateText(content: string, maxLength: number) {
    if (content.length <= maxLength) return content;
    return `${content.slice(0, maxLength)}\n...[内容已截断]`;
  }

  private sanitizeToolPreview(payload: unknown) {
    const serialized = JSON.stringify(payload, null, 2);
    if (!serialized) return '';
    return this.truncateText(serialized, TOOL_CONTEXT_MAX_PREVIEW_LENGTH);
  }

  private sanitizeConversationHistory(
    messages: Array<Pick<AiMessage, 'role' | 'content'>>,
  ) {
    return messages
      .filter((message) => ['user', 'assistant'].includes(message.role))
      .map((message) => ({
        role: message.role as 'user' | 'assistant',
        content: this.ensureString(message.content),
      }))
      .filter((message) => message.content)
      .slice(-12);
  }

  private async ensureQuestionnaireAccess(
    questionnaireId: number,
    userId: number,
  ) {
    const questionnaire = await this.questionRepository.findOneBy({
      id: questionnaireId,
    });

    if (!questionnaire || questionnaire.is_deleted) {
      throw new NotFoundException('问卷不存在或已被删除');
    }

    if (questionnaire.author_id !== userId) {
      throw new ForbiddenException('你没有权限访问当前问卷');
    }

    return questionnaire;
  }

  private async requireConversation(
    id: number,
    userId: number,
    options?: {
      withMessages?: boolean;
      withAttachments?: boolean;
    },
  ) {
    const conversation = await this.aiConversationRepository.findOneBy({
      id,
      user_id: userId,
    });

    if (!conversation) {
      throw new NotFoundException('会话不存在');
    }

    if (options?.withMessages) {
      conversation.messages = await this.aiMessageRepository.find({
        where: {
          conversation_id: conversation.id,
        },
        order: {
          create_time: 'ASC',
        },
      });
    }

    if (options?.withAttachments) {
      conversation.attachments = await this.aiAttachmentRepository.find({
        where: {
          conversation_id: conversation.id,
        },
        order: {
          create_time: 'DESC',
        },
      });
    }

    return conversation;
  }

  async listConversations(questionnaireId: number, userId: number) {
    await this.ensureQuestionnaireAccess(questionnaireId, userId);
    const conversations = await this.aiConversationRepository.find({
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
      this.serializeConversation(conversation),
    );
  }

  async createConversation(dto: CreateConversationDto, userId: number) {
    const questionnaire = await this.ensureQuestionnaireAccess(
      dto.questionnaireId,
      userId,
    );

    const conversation = this.aiConversationRepository.create({
      questionnaire_id: questionnaire.id,
      user_id: userId,
      title: this.pickConversationTitle(dto.title),
      intent: dto.intent === 'edit' ? 'edit' : 'generate',
      latest_activity_at: new Date(),
    });

    const saved = await this.aiConversationRepository.save(conversation);
    return this.serializeConversationDetail(saved, []);
  }

  async getConversationDetail(id: number, userId: number) {
    const conversation = await this.requireConversation(id, userId, {
      withMessages: true,
    });

    return this.serializeConversationDetail(
      conversation,
      conversation.messages || [],
    );
  }

  async updateConversation(
    id: number,
    dto: UpdateConversationDto,
    userId: number,
  ) {
    const conversation = await this.requireConversation(id, userId);

    if (typeof dto.title === 'string') {
      conversation.title = this.pickConversationTitle(dto.title);
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

    const saved = await this.aiConversationRepository.save(conversation);
    return this.serializeConversation(saved);
  }

  async deleteConversation(id: number, userId: number) {
    const conversation = await this.requireConversation(id, userId, {
      withAttachments: true,
    });

    const attachments = conversation.attachments || [];
    await Promise.all(
      attachments.map((attachment) => this.safeUnlink(attachment.file_name)),
    );
    await this.aiConversationRepository.remove(conversation);
  }

  private async findPreferredConversation(
    questionnaireId: number,
    userId: number,
  ) {
    return this.aiConversationRepository.findOne({
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
  }

  private async createConversationFromCopilotRequest(
    dto: SanitizedCopilotDto,
    userId: number,
  ) {
    const resolvedModel = this.resolveModelSelection(dto.model);
    const conversation = this.aiConversationRepository.create({
      questionnaire_id: dto.questionnaireId,
      user_id: userId,
      title: this.pickConversationTitle(
        undefined,
        dto.originalInstruction || dto.instruction,
      ),
      intent: dto.intent,
      last_model: resolvedModel.key,
      last_instruction: dto.instruction,
      latest_activity_at: new Date(),
    });

    return this.aiConversationRepository.save(conversation);
  }

  private async resolveCopilotConversation(
    dto: SanitizedCopilotDto,
    userId: number,
  ) {
    if (dto.conversationId) {
      const conversation = await this.requireConversation(
        dto.conversationId,
        userId,
      );
      if (conversation.questionnaire_id !== dto.questionnaireId) {
        throw new ForbiddenException('会话与当前问卷不匹配');
      }
      return conversation;
    }

    const existingConversation = await this.findPreferredConversation(
      dto.questionnaireId,
      userId,
    );
    if (existingConversation) {
      return existingConversation;
    }

    return this.createConversationFromCopilotRequest(dto, userId);
  }

  private async loadConversationHistory(
    conversationId: number,
  ): Promise<Array<Pick<AiMessage, 'role' | 'content'>>> {
    const messages = await this.aiMessageRepository.find({
      where: {
        conversation_id: conversationId,
        role: In(['user', 'assistant']),
      },
      order: {
        create_time: 'ASC',
      },
    });

    return messages;
  }

  private async persistConversationMessage(params: {
    conversationId: number;
    role: AiMessageRole;
    kind?: AiMessageKind;
    content: string;
    toolName?: string | null;
    meta?: Record<string, any> | null;
  }) {
    const message = this.aiMessageRepository.create({
      conversation_id: params.conversationId,
      role: params.role,
      kind: params.kind || 'chat',
      content: params.content,
      tool_name: params.toolName || null,
      meta: params.meta || null,
    });

    const saved = await this.aiMessageRepository.save(message);
    await this.aiConversationRepository.update(params.conversationId, {
      message_count: await this.aiMessageRepository.count({
        where: { conversation_id: params.conversationId },
      }),
      latest_activity_at: new Date(),
    });
    return saved;
  }

  private ensureString(value: unknown, fallback = '') {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return fallback;
  }

  private ensureObject(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<string, any>;
  }

  private normalizeStringList(value: unknown, fallback: string[] = []) {
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
            if (
              typeof candidate === 'number' ||
              typeof candidate === 'boolean'
            ) {
              return String(candidate);
            }
          }
        }
        return '';
      })
      .filter(Boolean);

    return normalized.length > 0 ? normalized : [...fallback];
  }

  private normalizeComponentProps(
    type: string,
    props: Record<string, any>,
  ): Record<string, any> {
    const nextProps = { ...props };

    if (
      type === 'questionRadio' ||
      type === 'questionCheckbox' ||
      type === 'questionDropdown'
    ) {
      nextProps.options = this.normalizeStringList(nextProps.options);
    }

    if (type === 'questionMatrixRadio' || type === 'questionMatrixCheckbox') {
      nextProps.rows = this.normalizeStringList(nextProps.rows);
      nextProps.columns = this.normalizeStringList(nextProps.columns);
    }

    return nextProps;
  }

  private sanitizeCopilotDto(dto: CopilotStreamDto): SanitizedCopilotDto {
    const snapshot = this.ensureObject(dto?.questionnaire);
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
      model: this.ensureString(dto?.model) || undefined,
      instruction: this.ensureString(dto?.instruction),
      originalInstruction: this.ensureString(dto?.originalInstruction),
      history: Array.isArray(dto?.history)
        ? dto.history
            .map((item) => ({
              role:
                item?.role === 'assistant'
                  ? ('assistant' as const)
                  : ('user' as const),
              content: this.ensureString(item?.content),
            }))
            .filter((item) => item.content)
        : [],
      questionnaire: {
        title: this.ensureString(snapshot.title, '未命名问卷'),
        description: this.ensureString(snapshot.description),
        footerText: this.ensureString(snapshot.footerText),
        components: rawComponents.map((component, index) => {
          const componentObject = this.ensureObject(component);
          const props = this.normalizeComponentProps(
            this.ensureString(componentObject.type),
            this.ensureObject(componentObject.props),
          );
          const title =
            this.ensureString(componentObject.title) ||
            this.ensureString(props.title, '未命名题目');

          return {
            fe_id: this.ensureString(
              componentObject.fe_id,
              `snapshot-${index + 1}`,
            ),
            type: this.ensureString(componentObject.type),
            title,
            props: {
              ...props,
              title,
            },
          };
        }),
      },
    };
  }

  private buildComponentCatalogPayload() {
    return [
      {
        type: 'questionTitle',
        title: '分段标题',
        notes: '用于分隔不同问题区域',
      },
      {
        type: 'questionShortAnswer',
        title: '简答题',
        notes: '适合单行文本输入',
      },
      {
        type: 'questionParagraph',
        title: '段落题',
        notes: '适合较长文本输入',
      },
      {
        type: 'questionRadio',
        title: '单选题',
        notes: 'props.options 必须是 string[]',
      },
      {
        type: 'questionCheckbox',
        title: '多选题',
        notes: 'props.options 必须是 string[]',
      },
      {
        type: 'questionDropdown',
        title: '下拉题',
        notes: 'props.options 必须是 string[]',
      },
      {
        type: 'questionRating',
        title: '评分题',
        notes: '常用 props.count',
      },
      {
        type: 'questionNPS',
        title: 'NPS 评分题',
        notes: '适合满意度推荐意愿场景',
      },
      {
        type: 'questionMatrixRadio',
        title: '矩阵单选题',
        notes: 'props.rows / props.columns 必须是 string[]',
      },
      {
        type: 'questionMatrixCheckbox',
        title: '矩阵多选题',
        notes: 'props.rows / props.columns 必须是 string[]',
      },
      {
        type: 'questionSlider',
        title: '滑块题',
        notes: '适合连续评分',
      },
      {
        type: 'questionDate',
        title: '日期题',
        notes: '适合日期采集',
      },
    ];
  }

  private shouldCollectAnswerStats(dto: SanitizedCopilotDto) {
    const normalizedInstruction = [dto.originalInstruction, dto.instruction]
      .filter(Boolean)
      .join('\n')
      .toLowerCase();

    return [
      '分析',
      '统计',
      '数据',
      '结果',
      '满意度',
      '作答',
      '答卷',
      '完成率',
      '转化',
      '表现',
      '回收',
    ].some((keyword) => normalizedInstruction.includes(keyword.toLowerCase()));
  }

  private buildToolContextBlock(toolContextList: CopilotToolContextItem[]) {
    if (toolContextList.length === 0) return '无额外工具上下文';

    return toolContextList
      .map((item) => {
        const preview = this.sanitizeToolPreview(item.payload);
        return [
          `工具名称: ${item.name}`,
          `摘要: ${item.summary}`,
          '输出预览:',
          preview || '无',
        ].join('\n');
      })
      .join('\n\n');
  }

  private async emitToolCall(
    res: Response,
    conversationId: number,
    toolName: CopilotToolName,
    callId: string,
    summary: string,
  ) {
    writeSseEvent(res, 'tool_call', {
      callId,
      toolName,
      summary,
    });
    await this.persistConversationMessage({
      conversationId,
      role: 'tool',
      kind: 'tool_call',
      content: summary,
      toolName,
      meta: {
        callId,
        status: 'running',
      },
    });
  }

  private async emitToolResult(
    res: Response,
    conversationId: number,
    toolName: CopilotToolName,
    callId: string,
    summary: string,
    payload: unknown,
    status: 'success' | 'error' = 'success',
  ) {
    const preview = this.sanitizeToolPreview(payload);
    writeSseEvent(res, 'tool_result', {
      callId,
      toolName,
      status,
      summary,
      preview,
    });
    await this.persistConversationMessage({
      conversationId,
      role: 'tool',
      kind: 'tool_result',
      content: summary,
      toolName,
      meta: {
        callId,
        status,
        preview,
      },
    });
  }

  private async collectToolContext(params: {
    dto: SanitizedCopilotDto;
    conversationId: number;
    res: Response;
    isClosed: () => boolean;
  }) {
    const { dto, conversationId, res, isClosed } = params;
    const toolContextList: CopilotToolContextItem[] = [];

    const runTool = async (
      toolName: CopilotToolName,
      summary: string,
      runner: () => Promise<unknown> | unknown,
    ) => {
      if (isClosed()) return;
      const callId = this.createToolCallId(toolName);
      await this.emitToolCall(res, conversationId, toolName, callId, summary);

      try {
        const payload = await runner();
        const nextItem: CopilotToolContextItem = {
          name: toolName,
          callId,
          summary,
          payload,
        };
        toolContextList.push(nextItem);
        await this.emitToolResult(
          res,
          conversationId,
          toolName,
          callId,
          summary,
          payload,
        );
      } catch (error: any) {
        await this.emitToolResult(
          res,
          conversationId,
          toolName,
          callId,
          error?.message || `${toolName} 执行失败`,
          {
            message: error?.message || `${toolName} 执行失败`,
          },
          'error',
        );
      }
    };

    await runTool(
      'get_questionnaire_snapshot',
      '读取当前编辑器中的问卷快照',
      async () => ({
        questionnaireId: dto.questionnaireId,
        title: dto.questionnaire.title,
        description: dto.questionnaire.description,
        footerText: dto.questionnaire.footerText,
        componentCount: dto.questionnaire.components.length,
        components: dto.questionnaire.components,
      }),
    );

    await runTool(
      'get_component_catalog',
      '读取问卷组件目录与约束',
      async () => ({
        count: this.buildComponentCatalogPayload().length,
        components: this.buildComponentCatalogPayload(),
      }),
    );

    if (this.shouldCollectAnswerStats(dto)) {
      await runTool(
        'get_answer_statistics',
        '读取当前问卷的作答统计摘要',
        async () => (await this.getEnhancedStats(dto.questionnaireId)) || null,
      );
    }

    return toolContextList;
  }

  private getWorkflowStage(dto: SanitizedCopilotDto): CopilotWorkflowStage {
    if (dto.intent === 'edit') return 'edit';
    return dto.generateStage;
  }

  private emitCopilotPhase(
    res: Response,
    currentPhaseRef: { current: CopilotRuntimePhase | null },
    phase: CopilotRuntimePhase,
    stage: CopilotWorkflowStage,
  ) {
    if (currentPhaseRef.current === phase) return;

    currentPhaseRef.current = phase;
    writeSseEvent(res, 'phase', {
      phase,
      stage,
    });
  }

  private buildPromptPolishPrompt(
    dto: SanitizedCopilotDto,
    toolContextText: string,
  ) {
    const snapshotJson = JSON.stringify(dto.questionnaire, null, 2);
    const hasExistingComponents = dto.questionnaire.components.length > 0;
    const generationTarget = hasExistingComponents
      ? [
          '当前问卷已经有内容，润色后的 Prompt 必须明确表达“基于现有问卷继续新增内容，不要整份覆盖旧问卷”。',
          '如果用户没有明确新增位置，不要臆造具体组件索引，只需要强调“新增一批可插入的组件”。',
          '如果需要描述新增内容，只描述题型方向、数量范围和填写目标，不要提前展开成每一道题的具体题干或选项。',
        ].join('\n')
      : [
          '当前问卷为空，润色后的 Prompt 应该引导生成一份完整的新问卷。',
          '请补足主题、目标人群、题型结构、题量和输出质量要求，让后续问卷生成更稳定。',
          '这里的“补足”只限于生成约束，不要直接替用户写出详细题目、选项内容或逐题清单。',
        ].join('\n');

    return `
你是问卷生成前的 Prompt 润色助手。

你的任务不是直接生成问卷 JSON，而是把用户的原始需求改写成一段“更适合问卷生成模型使用的最终 Prompt”。

你必须遵守以下规则：
1. 只输出润色后的最终 Prompt 正文，不要输出解释、标题、前言、总结、Markdown 代码块或序号。
2. 结果必须是用户可以直接再编辑后提交给“问卷生成阶段”的指令文本。
3. 优先补足以下信息：问卷主题、目标人群、题量范围、题型结构、输出风格、是否需要标题/描述/页脚。
4. 不要直接展开成详细题目、题干列表、选项列表、逐题顺序、组件 JSON 或其他实现细节；应该只保留高层生成要求和约束。
5. 可以做合理补全，但不要凭空捏造业务背景、行业黑话或不存在的数据。
6. 最终 Prompt 要简洁、可执行、可直接驱动模型生成高质量问卷。

${generationTarget}

当前问卷快照：
${snapshotJson}

可用工具上下文：
${toolContextText}

用户原始需求：
${dto.instruction}
`.trim();
  }

  private buildComponentTypeRules() {
    return [
      'questionTitle: 分段标题',
      'questionShortAnswer: 简答题/文本输入',
      'questionParagraph: 段落说明',
      'questionRadio: 单选题（options 必须是 string[]）',
      'questionCheckbox: 多选题（options 必须是 string[]）',
      'questionDropdown: 下拉题（options 必须是 string[]）',
      'questionRating: 星级评分题',
      'questionNPS: NPS 评分题',
      'questionMatrixRadio: 矩阵单选题（rows/columns 必须是 string[]）',
      'questionMatrixCheckbox: 矩阵多选题（rows/columns 必须是 string[]）',
      'questionSlider: 滑块题',
      'questionDate: 日期题',
    ].join('\n');
  }

  private buildCopilotPrompt(dto: CopilotStreamDto, toolContextText: string) {
    const snapshotJson = JSON.stringify(dto.questionnaire, null, 2);
    const historyText =
      dto.history
        .filter((item) => item.content?.trim())
        .map((item) => `${item.role}: ${item.content}`)
        .join('\n') || '无历史消息';
    const hasExistingComponents = dto.questionnaire.components.length > 0;
    const originalInstruction =
      dto.originalInstruction?.trim() || dto.instruction;
    const instructionBlock =
      dto.intent === 'generate'
        ? `用户原始需求：
${originalInstruction}

用户确认后的生成指令：
${dto.instruction}`
        : `用户本轮修改指令：
${dto.instruction}`;

    const modeInstruction =
      dto.intent === 'generate'
        ? hasExistingComponents
          ? [
              '当前问卷已经有内容。本轮 generate 的目标不是整份替换，而是基于现有问卷继续新增一批可插入的组件。',
              '你输出的草稿只包含“本次新增的组件”，不要把原问卷已有组件重新重复输出。',
              'PAGE_CONFIG 可以沿用当前问卷信息；如果你认为无需修改标题/描述/页脚，可以直接复用当前内容。',
            ].join('\n')
          : [
              '当前问卷为空。请生成一份可直接落地的新问卷草稿。',
              '需要输出完整的 PAGE_CONFIG 和本次生成的全部组件。',
              '问卷标题和问卷描述必须根据用户需求重新生成，不能留空，不能写成“未命名问卷”或通用占位文案。',
            ].join('\n')
        : [
            '当前是 edit 模式。你需要返回本轮修改涉及的原组件，以及需要新增的组件。',
            '未提到的原组件会由系统自动保留，不要把没改的题目整份重复输出。',
            '保留未修改组件的 fe_id。',
            '新增组件请生成新的 fe_id。',
            '当前版本不要通过省略组件表达删除。',
          ].join('\n');

    return `
你是问卷编辑器里的 AI Copilot。你要根据用户指令，生成可直接用于问卷编辑器的结构化草稿。

你必须严格遵守以下规则：
1. 只允许使用以下组件类型：
${this.buildComponentTypeRules()}
2. 输出必须严格使用块级协议，不能输出 Markdown 代码块，不能输出协议之外的解释。
3. 输出顺序必须固定为：

<<<PAGE_CONFIG>>>
{"title":"...","description":"...","footerText":"..."}
<<<END_PAGE_CONFIG>>>

<<<COMPONENT>>>
{"fe_id":"...","type":"questionRadio","title":"...","props":{"title":"..."}}
<<<END_COMPONENT>>>

可以重复多个 COMPONENT 块，结束组件输出后必须输出：
<<<END_DRAFT>>>

最后必须输出你的自然语言回复（方便做一些简短总结）：
<<<ASSISTANT_REPLY>>>
自然语言回复
<<<END_ASSISTANT_REPLY>>>
4. 每个 COMPONENT 块都是一个完整 JSON 对象，props 必须是对象。
5. title 和 props.title 要保持一致。
6. 不要输出任何注释、序号、列表符号或多余文本。
7. 选项类组件不要输出对象数组。options、rows、columns 里的每一项都必须是纯字符串。
8. 组件标题必须是可直接给用户看的完整自然语言内容，不能只写 1/2/3 这种序号，也不能只写“简答题”“单选题”“多选题”这类占位词。

当前任务模式：${dto.intent}
${modeInstruction}

当前问卷快照：
${snapshotJson}

历史对话：
${historyText}

工具上下文：
${toolContextText}

${instructionBlock}
`.trim();
  }

  private async streamPromptRefine(
    dto: SanitizedCopilotDto,
    client: OpenAI,
    modelConfig: ModelRuntimeConfig,
    abortController: AbortController,
    res: Response,
    toolContextText: string,
    isClosed: () => boolean,
  ): Promise<{ refinedPrompt: string; reply: string } | null> {
    const prompt = this.buildPromptPolishPrompt(dto, toolContextText);
    let refinedPrompt = '';
    const currentPhaseRef: { current: CopilotRuntimePhase | null } = {
      current: null,
    };

    this.emitCopilotPhase(res, currentPhaseRef, 'polishing', 'polish');

    const stream = await client.chat.completions.create(
      {
        model: modelConfig.model,
        stream: true,
        messages: [
          {
            role: 'system',
            content:
              '你是严谨的问卷 Prompt 润色助手，只输出可直接用于问卷生成的最终 Prompt 正文。',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      },
      {
        signal: abortController.signal,
      },
    );

    for await (const chunk of stream) {
      if (isClosed()) break;

      const content = chunk.choices[0]?.delta?.content || '';
      if (!content) continue;

      refinedPrompt += content;
      writeSseEvent(res, 'prompt_delta', { delta: content });
    }

    if (isClosed()) return null;

    const finalPrompt = refinedPrompt.trim();
    if (!finalPrompt) {
      throw new Error('AI 未生成可确认的润色 Prompt，请重试');
    }

    const reply = 'Prompt 润色完成，已回填到输入框，可继续编辑或直接发送。';
    writeSseEvent(res, 'prompt_refined', {
      prompt: finalPrompt,
      reply,
    });
    writeSseEvent(res, 'done', {
      ok: true,
      stage: 'polish',
    });
    return {
      refinedPrompt: finalPrompt,
      reply,
    };
  }

  private async streamDraftStage(
    dto: SanitizedCopilotDto,
    client: OpenAI,
    modelConfig: ModelRuntimeConfig,
    abortController: AbortController,
    res: Response,
    toolContextText: string,
    isClosed: () => boolean,
  ): Promise<{
    reply: string;
    draft: QuestionnaireDraft;
    summary: DraftSummary;
  } | null> {
    const prompt = this.buildCopilotPrompt(dto, toolContextText);
    const workflowStage = this.getWorkflowStage(dto);
    let accumulatedContent = '';
    let lastAssistantReply = '';
    let lastDraftSignature = '';
    let lastWarningSignature = '';
    const currentPhaseRef: { current: CopilotRuntimePhase | null } = {
      current: null,
    };

    this.emitCopilotPhase(res, currentPhaseRef, 'thinking', workflowStage);

    const emitParserWarning = (parsedWarningList: string[]) => {
      if (parsedWarningList.length === 0) return;

      const nextSignature = parsedWarningList.join('|');
      if (nextSignature === lastWarningSignature) return;

      lastWarningSignature = nextSignature;
      writeSseEvent(res, 'warning', {
        code: 'PARTIAL_COMPONENT_PARSE_SKIPPED',
        message: `AI 输出里有 ${parsedWarningList.length} 个组件块解析失败，已自动跳过，已解析成功的内容仍可继续预览和应用。`,
      });
    };

    const stream = await client.chat.completions.create(
      {
        model: modelConfig.model,
        stream: true,
        messages: [
          {
            role: 'system',
            content: '你是严谨的问卷编辑 Copilot，只输出协议规定的块内容。',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      },
      {
        signal: abortController.signal,
      },
    );

    for await (const chunk of stream) {
      if (isClosed()) break;

      const content = chunk.choices[0]?.delta?.content || '';
      if (!content) continue;

      accumulatedContent += content;

      const parsed = parseCopilotBlocks(accumulatedContent);
      emitParserWarning(parsed.warnings);

      if (parsed.assistantReply.length > lastAssistantReply.length) {
        const delta = parsed.assistantReply.slice(lastAssistantReply.length);
        lastAssistantReply = parsed.assistantReply;

        if (delta) {
          this.emitCopilotPhase(
            res,
            currentPhaseRef,
            'answering',
            workflowStage,
          );
          writeSseEvent(res, 'assistant_delta', { delta });
        }
      }

      if (parsed.pageConfig || parsed.components.length > 0) {
        const draftPartial = normalizeDraft(
          parsed,
          dto.questionnaire,
          dto.intent,
        );
        const signature = JSON.stringify(draftPartial);

        if (signature !== lastDraftSignature) {
          lastDraftSignature = signature;
          this.emitCopilotPhase(
            res,
            currentPhaseRef,
            'drafting',
            workflowStage,
          );
          writeSseEvent(res, 'draft_partial', {
            draft: draftPartial,
            progress: {
              componentsParsed: draftPartial.components.length,
            },
          });
        }
      }
    }

    if (isClosed()) return null;

    const parsed = parseCopilotBlocks(accumulatedContent);
    emitParserWarning(parsed.warnings);

    if (parsed.errors.length > 0) {
      throw new Error(parsed.errors[0]);
    }

    if (!parsed.endDraftReached) {
      throw new Error('AI 输出未正确结束，缺少 END_DRAFT 标记');
    }

    if (parsed.warnings.length > 0 && parsed.components.length === 0) {
      throw new Error('AI 输出中的组件都解析失败，当前没有可应用内容，请重试');
    }

    const rawDraft: QuestionnaireDraft = normalizeDraft(
      parsed,
      dto.questionnaire,
      dto.intent,
    );

    const { draft: validatedDraft, warnings: validationWarnings } =
      validateDraft(rawDraft, dto.questionnaire, dto.intent);

    if (validationWarnings.length > 0) {
      writeSseEvent(res, 'warning', {
        code: 'COMPONENT_VALIDATION_FILTERED',
        message: `${validationWarnings.length} 个组件未通过校验已自动跳过，其余组件仍可应用。`,
        details: validationWarnings,
      });
    }

    this.emitCopilotPhase(res, currentPhaseRef, 'drafting', workflowStage);
    const reply = parsed.assistantReply || '已生成可应用草稿';
    const summary = buildDiffSummary(
      dto.questionnaire,
      validatedDraft,
      dto.intent,
    );
    writeSseEvent(res, 'draft', {
      reply,
      draft: validatedDraft,
      summary,
    });
    writeSseEvent(res, 'done', {
      ok: true,
      stage: workflowStage,
    });
    return {
      reply,
      draft: validatedDraft,
      summary,
    };
  }

  async streamCopilot(
    dto: CopilotStreamDto,
    user: UserToken,
    req: Request,
    res: Response,
  ) {
    const abortController = new AbortController();
    let closed = false;
    let sseInitialized = false;
    let timeoutTriggered = false;
    let timeoutId: NodeJS.Timeout | null = null;
    let conversationId: number | null = null;

    const handleClose = () => {
      if (closed) return;
      closed = true;
      abortController.abort();
    };

    req.on('close', handleClose);

    try {
      initSseResponse(res);
      sseInitialized = true;

      const safeDto = this.sanitizeCopilotDto(dto);
      await this.ensureQuestionnaireAccess(
        safeDto.questionnaireId,
        user.userId,
      );

      if (!safeDto.instruction) {
        throw new Error('请输入本轮 AI 指令后再发送');
      }
      if (
        safeDto.intent === 'generate' &&
        safeDto.generateStage === 'generate' &&
        !safeDto.originalInstruction
      ) {
        safeDto.originalInstruction = safeDto.instruction;
      }

      const resolvedModel = this.resolveModelSelection(safeDto.model);
      const client =
        resolvedModel.key === this.defaultModel
          ? this.openai
          : this.createClientForModel(resolvedModel.key);
      const requestId = this.createRequestId();
      const workflowStage = this.getWorkflowStage(safeDto);
      const conversation = await this.resolveCopilotConversation(
        safeDto,
        user.userId,
      );
      conversationId = conversation.id;

      const conversationHistory = await this.loadConversationHistory(
        conversation.id,
      );
      safeDto.history =
        conversationHistory.length > 0
          ? this.sanitizeConversationHistory(conversationHistory)
          : safeDto.history;
      conversation.intent = safeDto.intent;
      conversation.last_model = resolvedModel.key;
      conversation.last_instruction = safeDto.instruction;
      conversation.latest_activity_at = new Date();
      if (conversation.title === DEFAULT_CONVERSATION_TITLE) {
        conversation.title = this.pickConversationTitle(
          undefined,
          safeDto.originalInstruction || safeDto.instruction,
        );
      }
      await this.aiConversationRepository.save(conversation);

      await this.persistConversationMessage({
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

      timeoutId = setTimeout(() => {
        timeoutTriggered = true;
        abortController.abort();
      }, COPILOT_STREAM_TIMEOUT_MS);

      writeSseEvent(res, 'meta', {
        requestId,
        conversationId: conversation.id,
        intent: safeDto.intent,
        baseVersion: safeDto.baseVersion,
        stage: workflowStage,
        timeoutMs: COPILOT_STREAM_TIMEOUT_MS,
      });

      const toolContextList = await this.collectToolContext({
        dto: safeDto,
        conversationId: conversation.id,
        res,
        isClosed: () => closed,
      });
      const toolContextText = this.buildToolContextBlock(toolContextList);

      if (safeDto.intent === 'generate' && safeDto.generateStage === 'polish') {
        const polishResult = await this.streamPromptRefine(
          safeDto,
          client,
          resolvedModel.config,
          abortController,
          res,
          toolContextText,
          () => closed,
        );
        if (polishResult) {
          conversation.last_instruction = polishResult.refinedPrompt;
          conversation.latest_activity_at = new Date();
          await this.aiConversationRepository.save(conversation);
          await this.persistConversationMessage({
            conversationId: conversation.id,
            role: 'assistant',
            kind: 'chat',
            content: polishResult.reply,
            meta: {
              requestId,
              stage: workflowStage,
              refinedPrompt: polishResult.refinedPrompt,
            },
          });
        }
      } else {
        const draftResult = await this.streamDraftStage(
          safeDto,
          client,
          resolvedModel.config,
          abortController,
          res,
          toolContextText,
          () => closed,
        );
        if (draftResult) {
          conversation.last_instruction = safeDto.instruction;
          conversation.latest_draft = draftResult.draft;
          conversation.latest_summary = draftResult.summary;
          conversation.latest_activity_at = new Date();
          await this.aiConversationRepository.save(conversation);
          await this.persistConversationMessage({
            conversationId: conversation.id,
            role: 'assistant',
            kind: 'chat',
            content: draftResult.reply,
            meta: {
              requestId,
              stage: workflowStage,
              draft: draftResult.draft,
              summary: draftResult.summary,
            },
          });
        }
      }
    } catch (error: any) {
      const workflowStage =
        !sseInitialized || !dto
          ? undefined
          : this.getWorkflowStage(this.sanitizeCopilotDto(dto));

      if (!closed) {
        console.error('AI copilot stream error:', error);
        if (conversationId) {
          await this.persistConversationMessage({
            conversationId,
            role: 'assistant',
            kind: 'chat',
            content: error?.message || 'AI 工作台生成失败，请稍后重试',
            meta: {
              status: 'error',
            },
          });
        }
        if (sseInitialized) {
          writeSseEvent(res, 'error', {
            code: timeoutTriggered
              ? 'COPILOT_STREAM_TIMEOUT'
              : 'COPILOT_STREAM_FAILED',
            message: timeoutTriggered
              ? 'AI 流式处理超时，请稍后重试'
              : error?.message || 'AI 工作台生成失败，请稍后重试',
            stage: workflowStage,
            retryable: true,
          });
        } else if (!res.headersSent) {
          res.status(500).json({
            code: timeoutTriggered
              ? 'COPILOT_STREAM_TIMEOUT'
              : 'COPILOT_STREAM_FAILED',
            message: timeoutTriggered
              ? 'AI 流式处理超时，请稍后重试'
              : error?.message || 'AI 工作台生成失败，请稍后重试',
          });
        }
      }
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      req.off('close', handleClose);
      if (!res.writableEnded) {
        res.end();
      }
    }
  }

  // 生成问卷的方法，接收主题参数，返回 Observable<MessageEvent>
  async generate(
    theme: string,
    count: number,
    modelName?: string,
  ): Promise<Observable<MessageEvent>> {
    const resolvedModel = this.resolveModelSelection(modelName);
    const client =
      resolvedModel.key === this.defaultModel
        ? this.openai
        : this.createClientForModel(resolvedModel.key);

    return new Observable((subscriber) => {
      // 构建提示词，要求生成特定格式的问卷 JSON
      const description = `生成一份关于${theme}的问卷，要求如下：
1. 问卷需包含${count}个问题，每个问题都要与${theme}主题相关
2. 输出格式为JSON，结构如下：
{
  "survey": {
    "title": "问卷标题",
    "description": "问卷目的说明",
    "questions": [
      {
        "fe_id": "数字字符串，确保唯一",
        "type": "问题类型，必须是以下之一：
          - questionTitle（分段标题）
          - questionShortAnswer（简答题）
          - questionParagraph（段落题）
          - questionRadio（单选题）
          - questionCheckbox（多选题）
          - questionDropdown（下拉选择题）
          - questionRating（评分题）
          - questionNPS（NPS评分题）
          - questionMatrixRadio（矩阵单选题）
          - questionMatrixCheckbox（矩阵多选题）
          - questionSlider（滑块题）
          - questionDate（日期选择题）",
        "title": "问题标题",
        "props": {
          // 根据不同类型设置不同属性
          // 单选、多选、下拉题：options: string[]
          // 评分题：count: number
          // NPS题：min: number, max: number
          // 矩阵题：rows: string[], columns: string[]
          // 滑块题：min: number, max: number, step: number
          // 日期题：format: "YYYY-MM-DD"
        }
      }
    ]
  }
}

3. 问题类型分配建议：
- 使用questionTitle作为分段标题，合理分隔不同类型的问题
- 包含2-3个简答或段落题
- 包含4-5个单选或多选题
- 包含1-2个评分或NPS题
- 包含1-2个矩阵题
- 其他类型根据主题合理分配

4. 确保生成的JSON格式正确，每个问题的props属性符合对应类型的要求。`;

      // 用于累积流式响应内容
      let accumulatedContent = '';
      // 用于取消请求的控制器
      const abortController = new AbortController();

      // 调用 OpenAI API 创建聊天完成
      client.chat.completions
        .create(
          {
            messages: [
              {
                role: 'system',
                content:
                  '你是一个专业的问卷设计专家，请根据用户的需求生成问卷。',
              },
              { role: 'user', content: description },
            ],
            model: resolvedModel.config.model,
            stream: true, // 启用流式响应
          },
          {
            signal: abortController.signal,
          },
        )
        .then(async (stream) => {
          try {
            // 处理流式响应的每个数据块
            for await (const chunk of stream) {
              const content = chunk.choices[0].delta.content || '';
              accumulatedContent += content;
              // 向订阅者发送累积的内容
              subscriber.next({ data: accumulatedContent } as MessageEvent);
              if (subscriber.closed) {
                abortController.abort();
              }
            }
            // 发送完成标记
            subscriber.next({ data: '{[DONE]}' } as MessageEvent);
          } catch (error) {
            subscriber.error(error);
          }
        })
        .catch((error) => {
          console.error('Error generating questionnaire:', error);
          subscriber.error(new Error('生成问卷时出错，请稍后重试。'));
        });

      // 清理函数，在取消订阅时调用
      return () => {
        abortController.abort();
        subscriber.complete();
      };
    });
  }

  async analysis(
    questionnaire_id: number,
    modelName?: string,
  ): Promise<Observable<MessageEvent>> {
    const resolvedModel = this.resolveModelSelection(modelName);
    const client =
      resolvedModel.key === this.defaultModel
        ? this.openai
        : this.createClientForModel(resolvedModel.key);

    // 获取问卷的统计数据
    const statsData =
      await this.answerService.getAnswersByQuestionId(questionnaire_id);

    // 获取问卷的详细信息
    const questionnaireDetail = await this.editorService.getQuestionnaireDetail(
      questionnaire_id.toString(),
    );

    return new Observable((subscriber) => {
      // 将统计数据格式化为分析友好的格式
      const formattedStats =
        statsData && statsData.length > 0
          ? JSON.stringify(statsData)
          : '暂无问卷统计数据';

      const formattedQuestions =
        questionnaireDetail && questionnaireDetail.components
          ? JSON.stringify(questionnaireDetail.components)
          : '暂无问题数据';

      // 构建简化版提示词
      const prompt = `
你是一位数据分析专家，请对以下问卷数据进行简要分析：

问卷标题: ${questionnaireDetail?.title || '未知标题'}
问卷描述: ${questionnaireDetail?.description || '无描述'}

数据: ${formattedStats}
问题: ${formattedQuestions}

请提供简洁的分析，包括：
1. 总体概况：回答人数、完成情况
2. 选择题分析：热门选项及比例
3. 评分题分析：平均分和中位数
4. 文本题分析：主要关键词
5. 最重要的2-3个发现
6. 1-2条具体建议

以简单JSON格式返回：
{
  "title": "分析标题",
  "overview": "整体概况简述",
  "key_insights": ["关键发现1", "关键发现2"],
  "question_analyses": [
    {
      "id": "问题ID",
      "title": "问题标题",
      "analysis": "简短分析"
    }
  ],
  "recommendations": ["建议1", "建议2"]
}

请确保分析简明扼要，直接以JSON格式输出，无需额外说明。
`;

      // 用于累积流式响应内容
      let accumulatedContent = '';
      // 用于取消请求的控制器
      const abortController = new AbortController();

      // 调用 OpenAI API 创建聊天完成
      client.chat.completions
        .create(
          {
            messages: [
              {
                role: 'system',
                content:
                  '你是一位数据分析专家，请根据用户提供的问卷数据进行分析。',
              },
              { role: 'user', content: prompt },
            ],
            model: resolvedModel.config.model,
            stream: true, // 启用流式响应
          },
          {
            signal: abortController.signal,
          },
        )
        .then(async (stream) => {
          try {
            // 处理流式响应的每个数据块
            for await (const chunk of stream) {
              const content = chunk.choices[0].delta.content || '';
              accumulatedContent += content;
              // 向订阅者发送累积的内容
              subscriber.next({ data: accumulatedContent } as MessageEvent);
              if (subscriber.closed) {
                abortController.abort();
              }
            }
            // 发送完成标记
            subscriber.next({ data: '{[DONE]}' } as MessageEvent);
          } catch (error) {
            subscriber.error(error);
          }
        })
        .catch((error) => {
          console.error('Error generating analysis:', error);
          subscriber.error(new Error('生成分析报告时出错，请稍后重试。'));
        });

      // 清理函数，在取消订阅时调用
      return () => {
        abortController.abort();
        subscriber.complete();
      };
    });
  }

  async getEnhancedStats(id: number) {
    // 获取问卷统计数据
    const statsData = await this.answerService.getAnswersByQuestionId(id);

    // 获取问卷详情信息
    const questionDetail = await this.editorService.getQuestionnaireDetail(
      id.toString(),
    );

    // 如果有问卷详情，为统计数据添加题目标题和其他信息
    if (questionDetail && questionDetail.components) {
      const enhancedStats = statsData.map((statItem) => {
        // 找到对应的题目组件
        const component = questionDetail.components.find(
          (comp) => String(comp.fe_id) === String(statItem.questionId),
        );

        // 如果找到对应组件，添加题目标题和其他信息
        if (component && component.props) {
          return {
            ...statItem,
            question: component.props.title || `问题${statItem.questionId}`,
            componentInfo: {
              title: component.title,
              type: component.type,
              props: component.props,
              options: this.extractOptionsFromComponent(component),
            },
          };
        }

        return statItem;
      });

      return {
        title: questionDetail.title,
        description: questionDetail.description,
        stats: enhancedStats,
      };
    }
  }

  // 辅助方法：根据组件类型提取选项信息
  private extractOptionsFromComponent(component: any): any {
    if (!component || !component.props) return null;

    // 从单选、多选和下拉选择题中提取选项
    if (
      ['questionRadio', 'questionCheckbox', 'questionDropdown'].includes(
        component.type,
      ) &&
      Array.isArray(component.props.options)
    ) {
      // 将字符串选项转换为包含文本和值的对象
      return component.props.options.map((opt) => ({
        text: opt,
        value: opt,
      }));
    }

    // 从评分题和NPS题中提取分数范围
    if (
      ['questionRating', 'questionNPS'].includes(component.type) &&
      component.props.count
    ) {
      const count = parseInt(component.props.count) || 5;
      return Array.from({ length: count }, (_, i) => ({
        text: String(i + 1),
        value: String(i + 1),
      }));
    }

    // 提取矩阵题的行和列信息
    if (
      ['questionMatrixRadio', 'questionMatrixCheckbox'].includes(component.type)
    ) {
      // 确保存在行和列属性
      const rows = component.props.rows || [];
      const columns = component.props.columns || [];

      console.log(
        `矩阵题组件解析 - 行数: ${rows.length}, 列数: ${columns.length}`,
      );
      console.log('矩阵题行:', rows);
      console.log('矩阵题列:', columns);

      // 始终返回行列信息，即使为空
      return {
        rows,
        columns,
      };
    }

    return null;
  }
}
