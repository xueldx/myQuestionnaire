import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from './ai.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import AiConversation from '@/service/ai/entities/ai-conversation.entity';
import AiMessage from '@/service/ai/entities/ai-message.entity';
import AiAttachment from '@/service/ai/entities/ai-attachment.entity';
import Question from '@/service/question/entities/question.entity';
import { AnswerService } from '@/service/answer/answer.service';
import { EditorService } from '@/service/editor/editor.service';
import { AiObservabilitySink } from '@/service/ai/observability/ai-observability.sink';
import { LocalMetricsSink } from '@/service/ai/observability/local-metrics.sink';

describe('AiService', () => {
  let service: AiService;
  let aiConversationRepository: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    findOneBy: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };
  let aiMessageRepository: {
    find: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    count: jest.Mock;
  };
  let aiAttachmentRepository: {
    find: jest.Mock;
  };
  let questionRepository: {
    findOneBy: jest.Mock;
  };
  let observabilitySink: {
    startRequest: jest.Mock;
    markFirstToken: jest.Mock;
    finishRequest: jest.Mock;
    patchOutcome: jest.Mock;
  };
  let localMetricsSink: {
    updateOutcome: jest.Mock;
    getSummary: jest.Mock;
    getTimeseries: jest.Mock;
  };

  beforeEach(async () => {
    aiConversationRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      findOneBy: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    aiMessageRepository = {
      find: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    };
    aiAttachmentRepository = {
      find: jest.fn(),
    };
    questionRepository = {
      findOneBy: jest.fn(),
    };
    observabilitySink = {
      startRequest: jest.fn(),
      markFirstToken: jest.fn(),
      finishRequest: jest.fn(),
      patchOutcome: jest.fn(),
    };
    localMetricsSink = {
      updateOutcome: jest.fn(),
      getSummary: jest.fn(),
      getTimeseries: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        {
          provide: AnswerService,
          useValue: {
            getAnswersByQuestionId: jest.fn(),
          },
        },
        {
          provide: EditorService,
          useValue: {
            getQuestionnaireDetail: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(AiConversation),
          useValue: aiConversationRepository,
        },
        {
          provide: getRepositoryToken(AiMessage),
          useValue: aiMessageRepository,
        },
        {
          provide: getRepositoryToken(AiAttachment),
          useValue: aiAttachmentRepository,
        },
        {
          provide: getRepositoryToken(Question),
          useValue: questionRepository,
        },
        {
          provide: AiObservabilitySink,
          useValue: observabilitySink,
        },
        {
          provide: LocalMetricsSink,
          useValue: localMetricsSink,
        },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should expose available models', () => {
    const models = service.getAvailableModels();
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
    expect(models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: 'modelscope-qwen3-plus',
          label: 'Qwen3-Plus',
        }),
      ]),
    );
  });

  it('should not collect answer stats for generic edit requests', () => {
    const shouldCollect = (service as any).shouldCollectAnswerStats({
      intent: 'edit',
      instruction: '把第 3 题改成多选，再补一个评分题',
      originalInstruction: '',
    });

    expect(shouldCollect).toBe(false);
  });

  it('should collect answer stats when the request explicitly mentions data signals', () => {
    const shouldCollect = (service as any).shouldCollectAnswerStats({
      intent: 'edit',
      instruction: '根据当前问卷的作答统计和满意度结果，帮我优化题目顺序',
      originalInstruction: '',
    });

    expect(shouldCollect).toBe(true);
  });

  it('should reuse the preferred questionnaire conversation when conversationId is missing', async () => {
    const existingConversation = {
      id: 18,
      questionnaire_id: 23,
      user_id: 7,
      intent: 'edit',
    };

    aiConversationRepository.findOne.mockResolvedValue(existingConversation);

    const createConversationFromCopilotRequestSpy = jest
      .spyOn(service as any, 'createConversationFromCopilotRequest')
      .mockResolvedValue({
        id: 99,
      });

    const result = await (service as any).resolveCopilotConversation(
      {
        questionnaireId: 23,
        intent: 'edit',
        instruction: '帮我补充一个评分题',
        originalInstruction: '帮我补充一个评分题',
        generateStage: 'generate',
      },
      7,
    );

    expect(aiConversationRepository.findOne).toHaveBeenCalledWith({
      where: {
        questionnaire_id: 23,
        user_id: 7,
      },
      order: {
        is_pinned: 'DESC',
        latest_activity_at: 'DESC',
        update_time: 'DESC',
      },
    });
    expect(result).toBe(existingConversation);
    expect(createConversationFromCopilotRequestSpy).not.toHaveBeenCalled();
  });

  it('should create a conversation when no questionnaire conversation exists', async () => {
    aiConversationRepository.findOne.mockResolvedValue(null);

    const createdConversation = {
      id: 42,
    };
    const createConversationFromCopilotRequestSpy = jest
      .spyOn(service as any, 'createConversationFromCopilotRequest')
      .mockResolvedValue(createdConversation);

    const result = await (service as any).resolveCopilotConversation(
      {
        questionnaireId: 23,
        intent: 'generate',
        instruction: '生成一份满意度问卷',
        originalInstruction: '生成一份满意度问卷',
        generateStage: 'generate',
      },
      7,
    );

    expect(result).toBe(createdConversation);
    expect(createConversationFromCopilotRequestSpy).toHaveBeenCalledTimes(1);
  });

  it('should reject an explicitly selected model when its config is invalid', () => {
    jest
      .spyOn(service as any, 'getModelRuntimeConfig')
      .mockImplementation((modelName: string) =>
        modelName === 'modelscope-qwen3-235b'
          ? {
              model: 'Qwen/Qwen3-235B-A22B-Instruct-2507',
              apiKey: 'valid-key',
              baseURL: 'https://api-inference.modelscope.cn/v1',
            }
          : null,
      );

    expect(() =>
      (service as any).resolveModelSelection('minimax-m2.5'),
    ).toThrow('模型 minimax-m2.5 缺少有效配置');
  });

  it('should delegate metric outcome updates to LocalMetricsSink', async () => {
    localMetricsSink.updateOutcome.mockResolvedValue(true);

    await expect(
      service.updateMetricOutcome(
        'req-1',
        {
          draftApplied: true,
        },
        7,
      ),
    ).resolves.toBe(true);

    expect(localMetricsSink.updateOutcome).toHaveBeenCalledWith(
      'req-1',
      {
        draftApplied: true,
      },
      7,
    );
  });

  it('should delegate metric summary queries to LocalMetricsSink', async () => {
    localMetricsSink.getSummary.mockResolvedValue({
      requestCount: 2,
    });

    await expect(
      service.getMetricSummary(
        {
          from: '2026-03-01T00:00:00.000Z',
          to: '2026-03-31T00:00:00.000Z',
        },
        7,
      ),
    ).resolves.toEqual({
      requestCount: 2,
    });

    expect(localMetricsSink.getSummary).toHaveBeenCalledWith(
      {
        from: '2026-03-01T00:00:00.000Z',
        to: '2026-03-31T00:00:00.000Z',
      },
      7,
    );
  });

  it('should delegate metric timeseries queries to LocalMetricsSink', async () => {
    localMetricsSink.getTimeseries.mockResolvedValue([
      {
        bucket: '2026-03-29T00:00:00',
        requestCount: 1,
      },
    ]);

    await expect(
      service.getMetricTimeseries(
        {
          from: '2026-03-01T00:00:00.000Z',
          to: '2026-03-31T00:00:00.000Z',
          bucket: 'day',
        },
        7,
      ),
    ).resolves.toEqual([
      {
        bucket: '2026-03-29T00:00:00',
        requestCount: 1,
      },
    ]);

    expect(localMetricsSink.getTimeseries).toHaveBeenCalledWith(
      {
        from: '2026-03-01T00:00:00.000Z',
        to: '2026-03-31T00:00:00.000Z',
        bucket: 'day',
      },
      7,
    );
  });
});
