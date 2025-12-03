import { Injectable, ForbiddenException } from '@nestjs/common';
import { Request, Response } from 'express';
import OpenAI from 'openai';
import { Observable } from 'rxjs';
import configuration from '@/config';
import { AnswerService } from '@/service/answer/answer.service';
import { EditorService } from '@/service/editor/editor.service';
import {
  CopilotToolName,
  CopilotStreamDto,
} from '@/service/ai/dto/copilot-stream.dto';
import {
  initSseResponse,
  writeSseEvent,
} from '@/service/ai/utils/write-sse-event';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import AiConversation from '@/service/ai/entities/ai-conversation.entity';
import AiMessage from '@/service/ai/entities/ai-message.entity';
import AiAttachment from '@/service/ai/entities/ai-attachment.entity';
import Question from '@/service/question/entities/question.entity';
import { UserToken } from '@/common/decorators/current-user.decorator';
import {
  CancelCopilotDto,
  CreateConversationDto,
  UpdateConversationDto,
} from '@/service/ai/dto/conversation.dto';
import { promises as fs } from 'fs';
import { join } from 'path';
import {
  executeCopilotStream,
  shouldCollectAnswerStats,
} from '@/service/ai/ai-copilot-runtime';
import {
  ensureObject,
  ensureString,
  normalizeComponentProps,
  normalizeStringList,
  SanitizedCopilotDto,
  sanitizeCopilotDto,
} from '@/service/ai/ai-copilot-sanitize';
import {
  createConversation,
  createConversationFromCopilotRequest,
  deleteConversation,
  findPreferredConversation,
  getConversationDetail,
  listConversations,
  loadConversationHistory,
  persistConversationMessage,
  requireConversation,
  resolveCopilotConversation,
  SerializedAiConversationDetail,
  SerializedAiConversationSummary,
  SerializedAiMessage,
  updateConversation,
  ensureQuestionnaireAccess,
  AiMessageKind,
  AiMessageRole,
} from '@/service/ai/ai-conversation-helpers';
import {
  analysis as runLegacyAnalysis,
  generate as runLegacyGenerate,
  getEnhancedStats as runEnhancedStats,
  extractOptionsFromComponent as extractLegacyOptionsFromComponent,
} from '@/service/ai/ai-legacy/ai-legacy-helpers';

enum Model {
  ModelScopeQwen3 = 'modelscope-qwen3-235b',
  MinimaxM2_5 = 'minimax-m2.5',
  ModelScopeGLM5 = 'modelscope-glm-5',
  ModelScopeKimik2 = 'modelscope-kimi-k2.5',
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
  [Model.MinimaxM2_5]: {
    value: Model.MinimaxM2_5,
    label: 'MiniMax M2.5',
    description: '魔搭社区 API Inference 接入的 MiniMax M2.5 模型',
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
};

const COPILOT_STREAM_TIMEOUT_MS = 90000;
const DEFAULT_CONVERSATION_TITLE = '未命名会话';
const TOOL_CONTEXT_MAX_PREVIEW_LENGTH = 4000;
const PLACEHOLDER_MARKERS = [
  'change_me',
  'your_',
  'example.com',
  'your_model_id_here',
];

type ActiveCopilotRequest = {
  requestId: string;
  conversationId: number;
  userId: number;
  abort: () => void;
};

@Injectable()
export class AiService {
  private readonly openai: OpenAI;
  private readonly defaultModel: Model = Model.ModelScopeQwen3;
  private readonly activeCopilotRequests = new Map<
    string,
    ActiveCopilotRequest
  >();

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

  private isPlaceholderValue(value: string) {
    const normalized = value.trim().toLowerCase();
    return PLACEHOLDER_MARKERS.some((marker) => normalized.includes(marker));
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

    if (
      this.isPlaceholderValue(modelConfig.model) ||
      this.isPlaceholderValue(modelConfig.apiKey) ||
      this.isPlaceholderValue(modelConfig.baseURL)
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

    if (preferredModel && !availableModelKeys.includes(preferredModel)) {
      throw new Error(`模型 ${preferredModel} 缺少有效配置`);
    }

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

  private getConversationHelperDeps() {
    return {
      aiConversationRepository: this.aiConversationRepository,
      aiMessageRepository: this.aiMessageRepository,
      aiAttachmentRepository: this.aiAttachmentRepository,
      questionRepository: this.questionRepository,
      formatDate: this.formatDate.bind(this),
      pickConversationTitle: this.pickConversationTitle.bind(this),
      resolveModelKey: (modelName?: string) =>
        this.resolveModelSelection(modelName).key,
      safeUnlink: this.safeUnlink.bind(this),
    };
  }

  private getRuntimeHelperDeps() {
    return {
      createToolCallId: this.createToolCallId.bind(this),
      buildComponentCatalogPayload:
        this.buildComponentCatalogPayload.bind(this),
      sanitizeToolPreview: this.sanitizeToolPreview.bind(this),
      getEnhancedStats: this.getEnhancedStats.bind(this),
      persistConversationMessage: this.persistConversationMessage.bind(this),
    };
  }

  private getLegacyHelperDeps() {
    return {
      answerService: this.answerService,
      editorService: this.editorService,
      openai: this.openai,
      defaultModel: this.defaultModel,
      resolveModelSelection: this.resolveModelSelection.bind(this),
      createClientForModel: this.createClientForModel.bind(this),
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
    return ensureQuestionnaireAccess(
      this.getConversationHelperDeps(),
      questionnaireId,
      userId,
    );
  }

  private async requireConversation(
    id: number,
    userId: number,
    options?: {
      withMessages?: boolean;
      withAttachments?: boolean;
    },
  ) {
    return requireConversation(
      this.getConversationHelperDeps(),
      id,
      userId,
      options,
    );
  }

  async listConversations(questionnaireId: number, userId: number) {
    return listConversations(
      this.getConversationHelperDeps(),
      questionnaireId,
      userId,
    );
  }

  async createConversation(dto: CreateConversationDto, userId: number) {
    return createConversation(this.getConversationHelperDeps(), dto, userId);
  }

  async getConversationDetail(id: number, userId: number) {
    return getConversationDetail(this.getConversationHelperDeps(), id, userId);
  }

  async updateConversation(
    id: number,
    dto: UpdateConversationDto,
    userId: number,
  ) {
    return updateConversation(
      this.getConversationHelperDeps(),
      id,
      dto,
      userId,
    );
  }

  async deleteConversation(id: number, userId: number) {
    return deleteConversation(this.getConversationHelperDeps(), id, userId);
  }

  async cancelCopilot(dto: CancelCopilotDto, user: UserToken) {
    const request = this.findActiveCopilotRequest(dto, user.userId);
    if (!request) {
      return {
        cancelled: false,
      };
    }

    request.abort();
    return {
      cancelled: true,
      requestId: request.requestId,
      conversationId: request.conversationId,
    };
  }

  private async findPreferredConversation(
    questionnaireId: number,
    userId: number,
  ) {
    return findPreferredConversation(
      this.getConversationHelperDeps(),
      questionnaireId,
      userId,
    );
  }

  private async createConversationFromCopilotRequest(
    dto: SanitizedCopilotDto,
    userId: number,
  ) {
    return createConversationFromCopilotRequest(
      this.getConversationHelperDeps(),
      dto,
      userId,
    );
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
    return loadConversationHistory(
      this.getConversationHelperDeps(),
      conversationId,
    );
  }

  private async persistConversationMessage(params: {
    conversationId: number;
    role: AiMessageRole;
    kind?: AiMessageKind;
    content: string;
    toolName?: string | null;
    meta?: Record<string, any> | null;
  }) {
    return persistConversationMessage(this.getConversationHelperDeps(), params);
  }

  private ensureString(value: unknown, fallback = '') {
    return ensureString(value, fallback);
  }

  private ensureObject(value: unknown) {
    return ensureObject(value);
  }

  private normalizeStringList(value: unknown, fallback: string[] = []) {
    return normalizeStringList(value, fallback);
  }

  private normalizeComponentProps(
    type: string,
    props: Record<string, any>,
  ): Record<string, any> {
    return normalizeComponentProps(type, props);
  }

  private sanitizeCopilotDto(dto: CopilotStreamDto): SanitizedCopilotDto {
    return sanitizeCopilotDto(dto);
  }

  private registerActiveCopilotRequest(request: ActiveCopilotRequest) {
    this.activeCopilotRequests.set(request.requestId, request);
  }

  private unregisterActiveCopilotRequest(requestId: string) {
    this.activeCopilotRequests.delete(requestId);
  }

  private findActiveCopilotRequest(dto: CancelCopilotDto, userId: number) {
    const normalizedRequestId = this.ensureString(dto.requestId);
    if (normalizedRequestId) {
      const matchedByRequestId =
        this.activeCopilotRequests.get(normalizedRequestId);
      if (matchedByRequestId?.userId === userId) {
        return matchedByRequestId;
      }
    }

    if (!dto.conversationId) {
      return null;
    }

    return Array.from(this.activeCopilotRequests.values())
      .reverse()
      .find(
        (request) =>
          request.userId === userId &&
          request.conversationId === dto.conversationId,
      );
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
    return shouldCollectAnswerStats(dto);
  }

  async streamCopilot(
    dto: CopilotStreamDto,
    user: UserToken,
    req: Request,
    res: Response,
  ) {
    return executeCopilotStream(
      {
        ...this.getRuntimeHelperDeps(),
        openai: this.openai,
        defaultModel: this.defaultModel,
        sanitizeCopilotDto: this.sanitizeCopilotDto.bind(this),
        ensureQuestionnaireAccess: this.ensureQuestionnaireAccess.bind(this),
        resolveModelSelection: this.resolveModelSelection.bind(this),
        createClientForModel: this.createClientForModel.bind(this),
        createRequestId: this.createRequestId.bind(this),
        resolveCopilotConversation: this.resolveCopilotConversation.bind(this),
        loadConversationHistory: this.loadConversationHistory.bind(this),
        sanitizeConversationHistory:
          this.sanitizeConversationHistory.bind(this),
        pickConversationTitle: this.pickConversationTitle.bind(this),
        registerActiveRequest: this.registerActiveCopilotRequest.bind(this),
        unregisterActiveRequest: this.unregisterActiveCopilotRequest.bind(this),
        saveConversation: (conversation: AiConversation) =>
          this.aiConversationRepository.save(conversation),
      },
      dto,
      user,
      req,
      res,
      COPILOT_STREAM_TIMEOUT_MS,
      DEFAULT_CONVERSATION_TITLE,
    );
  }

  // 生成问卷的方法，接收主题参数，返回 Observable<MessageEvent>
  async generate(
    theme: string,
    count: number,
    modelName?: string,
  ): Promise<Observable<MessageEvent>> {
    return runLegacyGenerate(
      this.getLegacyHelperDeps(),
      theme,
      count,
      modelName,
    );
  }

  async analysis(
    questionnaire_id: number,
    modelName?: string,
  ): Promise<Observable<MessageEvent>> {
    return runLegacyAnalysis(
      this.getLegacyHelperDeps(),
      questionnaire_id,
      modelName,
    );
  }

  async getEnhancedStats(id: number) {
    return runEnhancedStats(this.getLegacyHelperDeps(), id);
  }

  // 辅助方法：根据组件类型提取选项信息
  private extractOptionsFromComponent(component: any): any {
    return extractLegacyOptionsFromComponent(component);
  }
}
