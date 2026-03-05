import { CopilotToolName } from '@/service/ai/dto/copilot-stream.dto';
import { SanitizedCopilotDto } from '@/service/ai/ai-copilot-sanitize';
import {
  CopilotContextStrategy,
  WINDOW_SUMMARY_OUTLINE_CONTEXT_STRATEGY,
} from '@/service/ai/context/context-strategy';
import {
  AiMessageKind,
  AiMessageRole,
} from '@/service/ai/ai-conversation-helpers';

export type CopilotToolContextItem = {
  name: CopilotToolName;
  callId: string;
  summary: string;
  payload: unknown;
};

export type CopilotEventSink = {
  emit: (event: string, data: Record<string, any>) => void;
  isClientConnected: () => boolean;
};

export type CopilotToolRuntimeDeps = {
  createToolCallId: (toolName: CopilotToolName) => string;
  buildComponentCatalogPayload: () => Array<Record<string, any>>;
  sanitizeToolPreview: (payload: unknown) => string;
  getEnhancedStats: (id: number) => Promise<any>;
  persistConversationMessage: (params: {
    conversationId: number;
    role: AiMessageRole;
    kind?: AiMessageKind;
    content: string;
    toolName?: string | null;
    meta?: Record<string, any> | null;
  }) => Promise<any>;
};

export const shouldCollectAnswerStats = (dto: SanitizedCopilotDto) => {
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
};

export const buildToolContextBlock = (
  deps: Pick<CopilotToolRuntimeDeps, 'sanitizeToolPreview'>,
  toolContextList: CopilotToolContextItem[],
) => {
  if (toolContextList.length === 0) return '无额外工具上下文';

  return toolContextList
    .map((item) => {
      const preview = deps.sanitizeToolPreview(item.payload);
      return [
        `工具名称: ${item.name}`,
        `摘要: ${item.summary}`,
        '输出预览:',
        preview || '无',
      ].join('\n');
    })
    .join('\n\n');
};

const emitToolCall = async (
  deps: Pick<CopilotToolRuntimeDeps, 'persistConversationMessage'>,
  sink: CopilotEventSink,
  conversationId: number,
  toolName: CopilotToolName,
  callId: string,
  summary: string,
) => {
  sink.emit('tool_call', {
    callId,
    toolName,
    summary,
  });
  await deps.persistConversationMessage({
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
};

const emitToolResult = async (
  deps: Pick<
    CopilotToolRuntimeDeps,
    'persistConversationMessage' | 'sanitizeToolPreview'
  >,
  sink: CopilotEventSink,
  conversationId: number,
  toolName: CopilotToolName,
  callId: string,
  summary: string,
  payload: unknown,
  status: 'success' | 'error' = 'success',
) => {
  const preview = deps.sanitizeToolPreview(payload);
  sink.emit('tool_result', {
    callId,
    toolName,
    status,
    summary,
    preview,
  });
  await deps.persistConversationMessage({
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
};

export const collectToolContext = async (
  deps: CopilotToolRuntimeDeps,
  params: {
    dto: SanitizedCopilotDto;
    conversationId: number;
    sink: CopilotEventSink;
    shouldStop: () => boolean;
    contextStrategy?: CopilotContextStrategy;
  },
) => {
  const { dto, conversationId, sink, shouldStop, contextStrategy } = params;
  const toolContextList: CopilotToolContextItem[] = [];

  const runTool = async (
    toolName: CopilotToolName,
    summary: string,
    runner: () => Promise<unknown> | unknown,
  ) => {
    if (shouldStop()) return;
    const callId = deps.createToolCallId(toolName);
    await emitToolCall(deps, sink, conversationId, toolName, callId, summary);

    try {
      const payload = await runner();
      if (shouldStop()) return;
      toolContextList.push({
        name: toolName,
        callId,
        summary,
        payload,
      });
      await emitToolResult(
        deps,
        sink,
        conversationId,
        toolName,
        callId,
        summary,
        payload,
      );
    } catch (error: any) {
      if (shouldStop()) return;
      await emitToolResult(
        deps,
        sink,
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

  if (contextStrategy !== WINDOW_SUMMARY_OUTLINE_CONTEXT_STRATEGY) {
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
  }

  await runTool(
    'get_component_catalog',
    '读取问卷组件目录与约束',
    async () => ({
      count: deps.buildComponentCatalogPayload().length,
      components: deps.buildComponentCatalogPayload(),
    }),
  );

  if (shouldCollectAnswerStats(dto)) {
    await runTool(
      'get_answer_statistics',
      '读取当前问卷的作答统计摘要',
      async () => (await deps.getEnhancedStats(dto.questionnaireId)) || null,
    );
  }

  return toolContextList;
};
