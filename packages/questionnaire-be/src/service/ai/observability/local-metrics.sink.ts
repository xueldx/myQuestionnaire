import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Question from '@/service/question/entities/question.entity';
import AiRequestMetric from '@/service/ai/entities/ai-request-metric.entity';
import {
  AiMetricOutcomePatch,
  AiObservabilityFinishParams,
  AiObservabilitySink,
  AiObservabilityStartParams,
} from '@/service/ai/observability/ai-observability.sink';
import {
  AiMetricsQueryDto,
  AiMetricTimeseriesQueryDto,
  UpdateAiMetricOutcomeDto,
} from '@/service/ai/dto/metrics.dto';

type AggregatedMetricRow = {
  bucket?: string;
  requestCount: string | number | null;
  doneCount: string | number | null;
  errorCount: string | number | null;
  cancelledCount: string | number | null;
  timeoutCount: string | number | null;
  disconnectTimeoutCount: string | number | null;
  totalTokens: string | number | null;
  avgPromptTokens: string | number | null;
  avgCompletionTokens: string | number | null;
  avgTotalTokens: string | number | null;
  avgDurationMs: string | number | null;
  avgTtftMs: string | number | null;
  draftReadyCount: string | number | null;
  draftAppliedCount: string | number | null;
  autoSaveSuccessCount: string | number | null;
  exactUsageCount: string | number | null;
};

type UsageResolution = {
  usageSource: 'provider_exact' | 'estimator';
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens: number | null;
  usageSnapshot: Record<string, any>;
};

const toFiniteNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const resolveRate = (numerator: number, denominator: number) =>
  denominator > 0 ? Number((numerator / denominator).toFixed(4)) : 0;

const estimateTokenCount = (text: string) => {
  const normalized = text || '';
  if (!normalized.trim()) return 0;

  const cjkCount = (normalized.match(/[\u3400-\u9fff]/g) || []).length;
  const otherCharCount = normalized.length - cjkCount;
  return Math.max(1, Math.ceil(otherCharCount / 4 + cjkCount / 1.5));
};

const buildUsageResolution = (
  promptText: string,
  completionText: string,
  providerUsage?: Record<string, any> | null,
  usageSnapshot?: Record<string, any> | null,
): UsageResolution => {
  const promptTokens = toFiniteNumber(providerUsage?.prompt_tokens);
  const completionTokens = toFiniteNumber(providerUsage?.completion_tokens);
  const totalTokens =
    toFiniteNumber(providerUsage?.total_tokens) ||
    promptTokens + completionTokens;
  const cachedTokens = Number.isFinite(
    Number(providerUsage?.prompt_tokens_details?.cached_tokens),
  )
    ? Number(providerUsage?.prompt_tokens_details?.cached_tokens)
    : null;

  if (promptTokens > 0 || completionTokens > 0 || totalTokens > 0) {
    return {
      usageSource: 'provider_exact',
      promptTokens,
      completionTokens,
      totalTokens,
      cachedTokens,
      usageSnapshot: {
        ...(usageSnapshot || {}),
        providerUsage,
      },
    };
  }

  const estimatedPromptTokens = estimateTokenCount(promptText);
  const estimatedCompletionTokens = estimateTokenCount(completionText);

  return {
    usageSource: 'estimator',
    promptTokens: estimatedPromptTokens,
    completionTokens: estimatedCompletionTokens,
    totalTokens: estimatedPromptTokens + estimatedCompletionTokens,
    cachedTokens: null,
    usageSnapshot: {
      ...(usageSnapshot || {}),
      estimator: {
        method: 'char_weighted_v1',
        promptChars: promptText.length,
        completionChars: completionText.length,
      },
      providerUsage: providerUsage || null,
    },
  };
};

const mapAggregatedRow = (row?: AggregatedMetricRow | null) => {
  const requestCount = toFiniteNumber(row?.requestCount);
  const doneCount = toFiniteNumber(row?.doneCount);
  const errorCount = toFiniteNumber(row?.errorCount);
  const cancelledCount = toFiniteNumber(row?.cancelledCount);
  const timeoutCount = toFiniteNumber(row?.timeoutCount);
  const disconnectTimeoutCount = toFiniteNumber(row?.disconnectTimeoutCount);
  const totalTokens = toFiniteNumber(row?.totalTokens);
  const avgPromptTokens = toFiniteNumber(row?.avgPromptTokens);
  const avgCompletionTokens = toFiniteNumber(row?.avgCompletionTokens);
  const avgTotalTokens = toFiniteNumber(row?.avgTotalTokens);
  const avgDurationMs = toFiniteNumber(row?.avgDurationMs);
  const avgTtftMs = toFiniteNumber(row?.avgTtftMs);
  const draftReadyCount = toFiniteNumber(row?.draftReadyCount);
  const draftAppliedCount = toFiniteNumber(row?.draftAppliedCount);
  const autoSaveSuccessCount = toFiniteNumber(row?.autoSaveSuccessCount);
  const exactUsageCount = toFiniteNumber(row?.exactUsageCount);

  return {
    requestCount,
    doneCount,
    errorCount,
    cancelledCount,
    timeoutCount,
    disconnectTimeoutCount,
    totalTokens,
    avgPromptTokens,
    avgCompletionTokens,
    avgTotalTokens,
    avgDurationMs,
    avgTtftMs,
    draftReadyRate: resolveRate(draftReadyCount, requestCount),
    draftAppliedRate: resolveRate(draftAppliedCount, draftReadyCount),
    autoSaveSuccessRate: resolveRate(autoSaveSuccessCount, draftAppliedCount),
    exactUsageCoverageRate: resolveRate(exactUsageCount, requestCount),
  };
};

@Injectable()
export class LocalMetricsSink extends AiObservabilitySink {
  constructor(
    @InjectRepository(AiRequestMetric)
    private readonly aiRequestMetricRepository: Repository<AiRequestMetric>,
    @InjectRepository(Question)
    private readonly questionRepository: Repository<Question>,
  ) {
    super();
  }

  async startRequest(params: AiObservabilityStartParams) {
    const existingMetric = await this.aiRequestMetricRepository.findOneBy({
      request_id: params.requestId,
    });

    if (existingMetric) {
      await this.aiRequestMetricRepository.update(existingMetric.id, {
        conversation_id: params.conversationId,
        questionnaire_id: params.questionnaireId,
        user_id: params.userId,
        intent: params.intent,
        workflow_stage: params.workflowStage,
        model_key: params.modelKey,
        provider_base_url: params.providerBaseUrl,
        context_strategy: params.contextStrategy,
        status: 'running',
        stop_reason: null,
        started_at: params.startedAt,
        context_snapshot: params.contextSnapshot as any,
      });
      return;
    }

    const metric = this.aiRequestMetricRepository.create({
      request_id: params.requestId,
      conversation_id: params.conversationId,
      questionnaire_id: params.questionnaireId,
      user_id: params.userId,
      intent: params.intent,
      workflow_stage: params.workflowStage,
      model_key: params.modelKey,
      provider_base_url: params.providerBaseUrl,
      context_strategy: params.contextStrategy,
      status: 'running',
      stop_reason: null,
      started_at: params.startedAt,
      context_snapshot: params.contextSnapshot,
      first_token_at: null,
      finished_at: null,
      duration_ms: null,
      ttft_ms: null,
      usage_source: null,
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null,
      cached_tokens: null,
      parse_warning_count: 0,
      draft_ready: false,
      draft_component_count: 0,
      draft_applied: false,
      discarded: false,
      auto_save_succeeded: false,
      auto_save_failed: false,
      usage_snapshot: null,
    });

    await this.aiRequestMetricRepository.save(metric);
  }

  async markFirstToken(params: { requestId: string; firstTokenAt: Date }) {
    const metric = await this.aiRequestMetricRepository.findOneBy({
      request_id: params.requestId,
    });
    if (!metric || metric.first_token_at) return;

    await this.aiRequestMetricRepository.update(metric.id, {
      first_token_at: params.firstTokenAt,
      ttft_ms: Math.max(
        0,
        params.firstTokenAt.getTime() - metric.started_at.getTime(),
      ),
    });
  }

  async finishRequest(params: AiObservabilityFinishParams) {
    const metric = await this.aiRequestMetricRepository.findOneBy({
      request_id: params.requestId,
    });
    if (!metric) return;

    const usageResolution = buildUsageResolution(
      params.promptText,
      params.completionText,
      params.providerUsage,
      params.usageSnapshot,
    );

    await this.aiRequestMetricRepository.update(metric.id, {
      status: params.status,
      stop_reason: params.stopReason,
      finished_at: params.finishedAt,
      duration_ms: Math.max(
        0,
        params.finishedAt.getTime() - metric.started_at.getTime(),
      ),
      usage_source: usageResolution.usageSource,
      prompt_tokens: usageResolution.promptTokens,
      completion_tokens: usageResolution.completionTokens,
      total_tokens: usageResolution.totalTokens,
      cached_tokens: usageResolution.cachedTokens,
      parse_warning_count: params.parseWarningCount || 0,
      draft_ready: Boolean(params.draftReady),
      draft_component_count: params.draftComponentCount || 0,
      usage_snapshot: usageResolution.usageSnapshot as any,
    });
  }

  async patchOutcome(params: {
    requestId: string;
    userId: number;
    outcome: AiMetricOutcomePatch;
  }) {
    const metric = await this.aiRequestMetricRepository.findOneBy({
      request_id: params.requestId,
      user_id: params.userId,
    });
    if (!metric) return false;

    const nextOutcome = params.outcome;
    const hasUpdates = [
      nextOutcome.draftApplied,
      nextOutcome.discarded,
      nextOutcome.autoSaveSucceeded,
      nextOutcome.autoSaveFailed,
    ].some((value) => typeof value === 'boolean');

    if (!hasUpdates) {
      throw new BadRequestException('至少需要提供一个 outcome 字段');
    }

    await this.aiRequestMetricRepository.update(metric.id, {
      ...(typeof nextOutcome.draftApplied === 'boolean'
        ? { draft_applied: nextOutcome.draftApplied }
        : {}),
      ...(typeof nextOutcome.discarded === 'boolean'
        ? { discarded: nextOutcome.discarded }
        : {}),
      ...(typeof nextOutcome.autoSaveSucceeded === 'boolean'
        ? { auto_save_succeeded: nextOutcome.autoSaveSucceeded }
        : {}),
      ...(typeof nextOutcome.autoSaveFailed === 'boolean'
        ? { auto_save_failed: nextOutcome.autoSaveFailed }
        : {}),
    });

    return true;
  }

  async updateOutcome(
    requestId: string,
    dto: UpdateAiMetricOutcomeDto,
    userId: number,
  ) {
    return this.patchOutcome({
      requestId,
      userId,
      outcome: dto,
    });
  }

  async getSummary(query: AiMetricsQueryDto, userId: number) {
    const { whereClause, params } = await this.buildMetricWhereClause(
      query,
      userId,
    );
    const [row] = (await this.aiRequestMetricRepository.query(
      `
        SELECT
          COUNT(*) AS requestCount,
          SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS doneCount,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errorCount,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelledCount,
          SUM(CASE WHEN status = 'timeout' THEN 1 ELSE 0 END) AS timeoutCount,
          SUM(CASE WHEN status = 'disconnect_timeout' THEN 1 ELSE 0 END) AS disconnectTimeoutCount,
          SUM(COALESCE(total_tokens, 0)) AS totalTokens,
          AVG(prompt_tokens) AS avgPromptTokens,
          AVG(completion_tokens) AS avgCompletionTokens,
          AVG(total_tokens) AS avgTotalTokens,
          AVG(duration_ms) AS avgDurationMs,
          AVG(ttft_ms) AS avgTtftMs,
          SUM(CASE WHEN draft_ready = 1 THEN 1 ELSE 0 END) AS draftReadyCount,
          SUM(CASE WHEN draft_applied = 1 THEN 1 ELSE 0 END) AS draftAppliedCount,
          SUM(CASE WHEN auto_save_succeeded = 1 THEN 1 ELSE 0 END) AS autoSaveSuccessCount,
          SUM(CASE WHEN usage_source = 'provider_exact' THEN 1 ELSE 0 END) AS exactUsageCount
        FROM ai_request_metric
        ${whereClause}
      `,
      params,
    )) as AggregatedMetricRow[];

    return mapAggregatedRow(row);
  }

  async getTimeseries(query: AiMetricTimeseriesQueryDto, userId: number) {
    const { whereClause, params } = await this.buildMetricWhereClause(
      query,
      userId,
    );
    const bucket = query.bucket === 'hour' ? 'hour' : 'day';
    const bucketExpr =
      bucket === 'hour'
        ? "DATE_FORMAT(started_at, '%Y-%m-%dT%H:00:00')"
        : "DATE_FORMAT(started_at, '%Y-%m-%dT00:00:00')";

    const rows = (await this.aiRequestMetricRepository.query(
      `
        SELECT
          ${bucketExpr} AS bucket,
          COUNT(*) AS requestCount,
          SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS doneCount,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errorCount,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelledCount,
          SUM(CASE WHEN status = 'timeout' THEN 1 ELSE 0 END) AS timeoutCount,
          SUM(CASE WHEN status = 'disconnect_timeout' THEN 1 ELSE 0 END) AS disconnectTimeoutCount,
          SUM(COALESCE(total_tokens, 0)) AS totalTokens,
          AVG(prompt_tokens) AS avgPromptTokens,
          AVG(completion_tokens) AS avgCompletionTokens,
          AVG(total_tokens) AS avgTotalTokens,
          AVG(duration_ms) AS avgDurationMs,
          AVG(ttft_ms) AS avgTtftMs,
          SUM(CASE WHEN draft_ready = 1 THEN 1 ELSE 0 END) AS draftReadyCount,
          SUM(CASE WHEN draft_applied = 1 THEN 1 ELSE 0 END) AS draftAppliedCount,
          SUM(CASE WHEN auto_save_succeeded = 1 THEN 1 ELSE 0 END) AS autoSaveSuccessCount,
          SUM(CASE WHEN usage_source = 'provider_exact' THEN 1 ELSE 0 END) AS exactUsageCount
        FROM ai_request_metric
        ${whereClause}
        GROUP BY ${bucketExpr}
        ORDER BY ${bucketExpr} ASC
      `,
      params,
    )) as AggregatedMetricRow[];

    return rows.map((row) => ({
      bucket: row.bucket || '',
      ...mapAggregatedRow(row),
    }));
  }

  private async buildMetricWhereClause(
    query: AiMetricsQueryDto | AiMetricTimeseriesQueryDto,
    userId: number,
  ) {
    const fromDate = new Date(query.from);
    const toDate = new Date(query.to);

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new BadRequestException('时间范围格式不正确');
    }

    if (fromDate.getTime() > toDate.getTime()) {
      throw new BadRequestException('from 不能晚于 to');
    }

    if (query.questionnaireId) {
      await this.ensureQuestionnaireOwner(query.questionnaireId, userId);
    }

    const clauses = [
      'WHERE user_id = ?',
      'AND started_at >= ?',
      'AND started_at <= ?',
    ];
    const params: Array<string | number | Date> = [userId, fromDate, toDate];

    if (query.questionnaireId) {
      clauses.push('AND questionnaire_id = ?');
      params.push(query.questionnaireId);
    }

    if (query.contextStrategy?.trim()) {
      clauses.push('AND context_strategy = ?');
      params.push(query.contextStrategy.trim());
    }

    if (query.modelKey?.trim()) {
      clauses.push('AND model_key = ?');
      params.push(query.modelKey.trim());
    }

    return {
      whereClause: clauses.join(' '),
      params,
    };
  }

  private async ensureQuestionnaireOwner(
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
  }
}
