import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { LocalMetricsSink } from '@/service/ai/observability/local-metrics.sink';

describe('LocalMetricsSink', () => {
  let aiRequestMetricRepository: {
    findOneBy: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    query: jest.Mock;
  };
  let questionRepository: {
    findOneBy: jest.Mock;
  };
  let sink: LocalMetricsSink;

  beforeEach(() => {
    aiRequestMetricRepository = {
      findOneBy: jest.fn(),
      create: jest.fn((payload) => payload),
      save: jest.fn(),
      update: jest.fn(),
      query: jest.fn(),
    };
    questionRepository = {
      findOneBy: jest.fn(),
    };
    sink = new LocalMetricsSink(
      aiRequestMetricRepository as any,
      questionRepository as any,
    );
  });

  it('creates a running metric record on startRequest', async () => {
    aiRequestMetricRepository.findOneBy.mockResolvedValue(null);
    aiRequestMetricRepository.save.mockResolvedValue(undefined);

    await sink.startRequest({
      requestId: 'req-1',
      conversationId: 12,
      questionnaireId: 23,
      userId: 7,
      intent: 'generate',
      workflowStage: 'generate',
      modelKey: 'qwen-plus',
      providerBaseUrl: 'https://api.example.com/v1',
      contextStrategy: 'baseline_v1',
      startedAt: new Date('2026-03-29T08:00:00.000Z'),
      contextSnapshot: {
        historyMessageCount: 3,
        questionnaireComponentCount: 8,
        historyChars: 120,
        questionnaireChars: 560,
        toolContextChars: 32,
        promptChars: 256,
        hasFocusedComponent: false,
        hasAnswerStatsTool: true,
      },
    });

    expect(aiRequestMetricRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        request_id: 'req-1',
        status: 'running',
        context_snapshot: expect.objectContaining({
          historyMessageCount: 3,
        }),
      }),
    );
    expect(aiRequestMetricRepository.save).toHaveBeenCalledTimes(1);
  });

  it('marks first token once and stores ttft', async () => {
    aiRequestMetricRepository.findOneBy.mockResolvedValue({
      id: 3,
      started_at: new Date('2026-03-29T08:00:00.000Z'),
      first_token_at: null,
    });

    await sink.markFirstToken({
      requestId: 'req-1',
      firstTokenAt: new Date('2026-03-29T08:00:01.250Z'),
    });

    expect(aiRequestMetricRepository.update).toHaveBeenCalledWith(
      3,
      expect.objectContaining({
        ttft_ms: 1250,
      }),
    );
  });

  it('does not overwrite first token when it already exists', async () => {
    aiRequestMetricRepository.findOneBy.mockResolvedValue({
      id: 3,
      started_at: new Date('2026-03-29T08:00:00.000Z'),
      first_token_at: new Date('2026-03-29T08:00:00.900Z'),
    });

    await sink.markFirstToken({
      requestId: 'req-1',
      firstTokenAt: new Date('2026-03-29T08:00:01.250Z'),
    });

    expect(aiRequestMetricRepository.update).not.toHaveBeenCalled();
  });

  it('stores provider usage when exact usage is returned', async () => {
    aiRequestMetricRepository.findOneBy.mockResolvedValue({
      id: 9,
      started_at: new Date('2026-03-29T08:00:00.000Z'),
    });

    await sink.finishRequest({
      requestId: 'req-1',
      status: 'done',
      stopReason: null,
      finishedAt: new Date('2026-03-29T08:00:04.000Z'),
      promptText: '请生成一份问卷',
      completionText: '好的',
      providerUsage: {
        prompt_tokens: 120,
        completion_tokens: 80,
        total_tokens: 200,
        prompt_tokens_details: {
          cached_tokens: 40,
        },
      },
      parseWarningCount: 2,
      draftReady: true,
      draftComponentCount: 6,
    });

    expect(aiRequestMetricRepository.update).toHaveBeenCalledWith(
      9,
      expect.objectContaining({
        status: 'done',
        duration_ms: 4000,
        usage_source: 'provider_exact',
        prompt_tokens: 120,
        completion_tokens: 80,
        total_tokens: 200,
        cached_tokens: 40,
        parse_warning_count: 2,
        draft_ready: true,
        draft_component_count: 6,
      }),
    );
  });

  it('falls back to estimator when provider usage is missing', async () => {
    aiRequestMetricRepository.findOneBy.mockResolvedValue({
      id: 10,
      started_at: new Date('2026-03-29T08:00:00.000Z'),
    });

    await sink.finishRequest({
      requestId: 'req-2',
      status: 'error',
      stopReason: null,
      finishedAt: new Date('2026-03-29T08:00:02.000Z'),
      promptText: '你好，请帮我润色这个问卷',
      completionText: '已完成润色',
    });

    expect(aiRequestMetricRepository.update).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        usage_source: 'estimator',
        prompt_tokens: expect.any(Number),
        completion_tokens: expect.any(Number),
        total_tokens: expect.any(Number),
      }),
    );
  });

  it('patches outcome fields idempotently', async () => {
    aiRequestMetricRepository.findOneBy.mockResolvedValue({
      id: 11,
      request_id: 'req-3',
      user_id: 7,
    });

    await expect(
      sink.patchOutcome({
        requestId: 'req-3',
        userId: 7,
        outcome: {
          draftApplied: true,
          autoSaveSucceeded: true,
        },
      }),
    ).resolves.toBe(true);

    expect(aiRequestMetricRepository.update).toHaveBeenCalledWith(
      11,
      expect.objectContaining({
        draft_applied: true,
        auto_save_succeeded: true,
      }),
    );
  });

  it('rejects empty outcome payloads', async () => {
    aiRequestMetricRepository.findOneBy.mockResolvedValue({
      id: 11,
      request_id: 'req-3',
      user_id: 7,
    });

    await expect(
      sink.patchOutcome({
        requestId: 'req-3',
        userId: 7,
        outcome: {},
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns mapped summary data for owned questionnaires', async () => {
    questionRepository.findOneBy.mockResolvedValue({
      id: 23,
      author_id: 7,
      is_deleted: false,
    });
    aiRequestMetricRepository.query.mockResolvedValue([
      {
        requestCount: 4,
        doneCount: 3,
        errorCount: 1,
        cancelledCount: 0,
        timeoutCount: 0,
        disconnectTimeoutCount: 0,
        totalTokens: 900,
        avgPromptTokens: 120,
        avgCompletionTokens: 105,
        avgTotalTokens: 225,
        avgDurationMs: 3400,
        avgTtftMs: 620,
        draftReadyCount: 3,
        draftAppliedCount: 2,
        autoSaveSuccessCount: 1,
        exactUsageCount: 2,
      },
    ]);

    await expect(
      sink.getSummary(
        {
          questionnaireId: 23,
          from: '2026-03-01T00:00:00.000Z',
          to: '2026-03-31T23:59:59.999Z',
        },
        7,
      ),
    ).resolves.toEqual({
      requestCount: 4,
      doneCount: 3,
      errorCount: 1,
      cancelledCount: 0,
      timeoutCount: 0,
      disconnectTimeoutCount: 0,
      totalTokens: 900,
      avgPromptTokens: 120,
      avgCompletionTokens: 105,
      avgTotalTokens: 225,
      avgDurationMs: 3400,
      avgTtftMs: 620,
      draftReadyRate: 0.75,
      draftAppliedRate: 0.6667,
      autoSaveSuccessRate: 0.5,
      exactUsageCoverageRate: 0.5,
    });
  });

  it('returns mapped timeseries buckets', async () => {
    aiRequestMetricRepository.query.mockResolvedValue([
      {
        bucket: '2026-03-29T00:00:00',
        requestCount: 2,
        doneCount: 2,
        errorCount: 0,
        cancelledCount: 0,
        timeoutCount: 0,
        disconnectTimeoutCount: 0,
        totalTokens: 300,
        avgPromptTokens: 90,
        avgCompletionTokens: 60,
        avgTotalTokens: 150,
        avgDurationMs: 2800,
        avgTtftMs: 500,
        draftReadyCount: 2,
        draftAppliedCount: 1,
        autoSaveSuccessCount: 1,
        exactUsageCount: 2,
      },
    ]);

    await expect(
      sink.getTimeseries(
        {
          from: '2026-03-01T00:00:00.000Z',
          to: '2026-03-31T23:59:59.999Z',
          bucket: 'day',
        },
        7,
      ),
    ).resolves.toEqual([
      {
        bucket: '2026-03-29T00:00:00',
        requestCount: 2,
        doneCount: 2,
        errorCount: 0,
        cancelledCount: 0,
        timeoutCount: 0,
        disconnectTimeoutCount: 0,
        totalTokens: 300,
        avgPromptTokens: 90,
        avgCompletionTokens: 60,
        avgTotalTokens: 150,
        avgDurationMs: 2800,
        avgTtftMs: 500,
        draftReadyRate: 1,
        draftAppliedRate: 0.5,
        autoSaveSuccessRate: 1,
        exactUsageCoverageRate: 1,
      },
    ]);
  });

  it('rejects access to questionnaires owned by another user', async () => {
    questionRepository.findOneBy.mockResolvedValue({
      id: 23,
      author_id: 8,
      is_deleted: false,
    });

    await expect(
      sink.getSummary(
        {
          questionnaireId: 23,
          from: '2026-03-01T00:00:00.000Z',
          to: '2026-03-31T23:59:59.999Z',
        },
        7,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
