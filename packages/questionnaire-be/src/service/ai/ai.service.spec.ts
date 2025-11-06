import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from './ai.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import AiConversation from '@/service/ai/entities/ai-conversation.entity';
import AiMessage from '@/service/ai/entities/ai-message.entity';
import AiAttachment from '@/service/ai/entities/ai-attachment.entity';
import Question from '@/service/question/entities/question.entity';
import { AnswerService } from '@/service/answer/answer.service';
import { EditorService } from '@/service/editor/editor.service';

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
});
