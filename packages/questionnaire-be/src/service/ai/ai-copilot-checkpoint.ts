import {
  CopilotWorkflowStage,
  DraftSummary,
  QuestionnaireDraft,
} from '@/service/ai/dto/copilot-stream.dto';
import { SanitizedCopilotDto } from '@/service/ai/ai-copilot-sanitize';
import { getFocusedQuestionBinding } from '@/service/ai/utils/question-reference';

const DRAFT_CHECKPOINT_INTERVAL_MS = 1_000;

type BuildLatestBatchStateParams = {
  requestId: string | null;
  safeDto: SanitizedCopilotDto | null;
  conversation: any | null;
  workflowStage: CopilotWorkflowStage | undefined;
  runtimeStatus: string | null;
  draft?: QuestionnaireDraft | null;
  summary?: DraftSummary | null;
};

export const buildCopilotLatestBatchState = ({
  requestId,
  safeDto,
  conversation,
  workflowStage,
  runtimeStatus,
  draft,
  summary,
}: BuildLatestBatchStateParams) => {
  const anchorBinding =
    safeDto?.intent === 'edit'
      ? getFocusedQuestionBinding(
          safeDto.focusedComponentId,
          safeDto.questionnaire.components || [],
        )
      : null;

  return [
    {
      id: requestId || `batch-${Date.now()}`,
      intent: safeDto?.intent || conversation?.intent || 'generate',
      title:
        safeDto?.originalInstruction ||
        safeDto?.instruction ||
        conversation?.title ||
        'AI 草稿',
      createdAt: new Date().toISOString(),
      baseVersion: safeDto?.baseVersion || 0,
      latestBaseQuestionnaire: safeDto?.questionnaire || null,
      latestDraft: draft ?? null,
      latestSummary: summary ?? null,
      lastRuntimeStatus: runtimeStatus,
      lastWorkflowStage: workflowStage || null,
      anchorQuestionId:
        safeDto?.intent === 'edit' ? safeDto.focusedComponentId || null : null,
      anchorQuestionTitle:
        safeDto?.intent === 'edit' ? anchorBinding?.title || null : null,
      selectedPatchIds: [],
      rejectedPatchIds: [],
    },
  ];
};

type CreateCopilotCheckpointManagerParams = {
  saveConversation: (conversation: any) => Promise<any>;
  runtimeState: {
    backgroundRunning: boolean;
  };
  getContext: () => {
    conversation: any | null;
    safeDto: SanitizedCopilotDto | null;
    workflowStage: CopilotWorkflowStage | undefined;
    requestId: string | null;
  };
};

type PersistDraftCheckpointParams = {
  draft?: QuestionnaireDraft | null;
  summary?: DraftSummary | null;
  runtimeStatus?: string | null;
  force?: boolean;
};

export const createCopilotCheckpointManager = ({
  saveConversation,
  runtimeState,
  getContext,
}: CreateCopilotCheckpointManagerParams) => {
  let lastCheckpointSavedAt = 0;
  let lastCheckpointSignature = '';

  const persistDraftCheckpoint = async (
    params?: PersistDraftCheckpointParams,
  ) => {
    const { conversation, safeDto, workflowStage, requestId } = getContext();
    if (!conversation || !safeDto || !workflowStage) return;

    if (params?.draft !== undefined) {
      conversation.latest_draft = params.draft;
    }
    if (params?.summary !== undefined) {
      conversation.latest_summary = params.summary;
    }

    conversation.latest_base_questionnaire = safeDto.questionnaire;
    conversation.last_workflow_stage = workflowStage;
    conversation.last_runtime_status =
      runtimeState.backgroundRunning && workflowStage !== 'polish'
        ? 'background_running'
        : (params?.runtimeStatus ??
          conversation.last_runtime_status ??
          (workflowStage === 'polish' ? 'polishing' : 'connecting'));
    conversation.latest_batches = buildCopilotLatestBatchState({
      requestId,
      safeDto,
      conversation,
      workflowStage,
      runtimeStatus: conversation.last_runtime_status,
      draft: (conversation.latest_draft as QuestionnaireDraft | null) || null,
      summary: (conversation.latest_summary as DraftSummary | null) || null,
    });
    conversation.latest_activity_at = new Date();

    const signature = JSON.stringify({
      latestDraft: conversation.latest_draft || null,
      latestSummary: conversation.latest_summary || null,
      latestBaseQuestionnaire: conversation.latest_base_questionnaire || null,
      lastRuntimeStatus: conversation.last_runtime_status || null,
      lastWorkflowStage: conversation.last_workflow_stage || null,
      latestBatches: conversation.latest_batches || null,
    });
    const now = Date.now();

    if (!params?.force) {
      if (signature === lastCheckpointSignature) {
        return;
      }
      if (now - lastCheckpointSavedAt < DRAFT_CHECKPOINT_INTERVAL_MS) {
        return;
      }
    }

    await saveConversation(conversation);
    lastCheckpointSignature = signature;
    lastCheckpointSavedAt = now;
  };

  return {
    persistDraftCheckpoint,
  };
};
