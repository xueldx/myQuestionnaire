import React, { useMemo } from 'react'
import { Alert, Button, Empty } from 'antd'
import {
  AiCopilotIntent,
  AiStreamStatus,
  QuestionnaireDraft,
  QuestionnairePatchSet
} from './aiCopilotTypes'
import {
  QuestionnairePatchStatus,
  applyQuestionnairePatchSet,
  getReviewablePatches,
  getPatchStatus
} from '../hooks/aiQuestionPatch'
import { AiDraftContextHint } from './AiDraftBatchBar'
import AiInlinePreviewHeader from './AiInlinePreviewHeader'
import AiInlinePreviewCardList from './AiInlinePreviewCardList'
import { buildAiPreviewCardEntries, buildReadonlyPreviewEntries } from './aiInlinePreviewModel'
import { PageConfigSuggestion, PatchActionButtons } from './AiInlinePreviewShared'
import { useAiPreviewAutoFollow } from '../hooks/useAiPreviewAutoFollow'

interface AiInlineQuestionnairePreviewProps {
  mode: AiCopilotIntent
  status: AiStreamStatus
  currentQuestionnaire: QuestionnaireDraft
  selectedId: string
  draftPartial: QuestionnaireDraft | null
  finalDraft: QuestionnaireDraft | null
  questionPatchSet: QuestionnairePatchSet | null
  selectedPatchIds: string[]
  errorMessage: string | null
  warningMessage: string | null
  draftApplied: boolean
  isApplyingDraft: boolean
  onSelectComponent: (feId: string) => void
  onApply: () => void
  onDiscard: () => void
  onBack: () => void
  onSelectAllPatches: () => void
  onClearPatchSelection: () => void
  rejectedPatchIds: string[]
  onApplyPatch: (patchId: string) => void
  onRejectPatch: (patchId: string) => void
}

const AiInlineQuestionnairePreview: React.FC<AiInlineQuestionnairePreviewProps> = ({
  mode,
  status,
  currentQuestionnaire,
  selectedId,
  draftPartial,
  finalDraft,
  questionPatchSet,
  selectedPatchIds,
  errorMessage,
  warningMessage,
  draftApplied,
  isApplyingDraft,
  onSelectComponent,
  onApply,
  onDiscard,
  onBack,
  onSelectAllPatches,
  onClearPatchSelection,
  rejectedPatchIds,
  onApplyPatch,
  onRejectPatch
}) => {
  const isCancelledPartialDraft = status === 'cancelled' && Boolean(draftPartial) && !finalDraft
  const isStreaming =
    status === 'connecting' ||
    status === 'thinking' ||
    status === 'answering' ||
    status === 'drafting'
  const reviewActionsDisabled = isStreaming || isApplyingDraft
  const currentComponents = currentQuestionnaire.components || []
  const patchStatusMap = Object.fromEntries(
    (questionPatchSet?.patches || []).map(patch => [
      patch.id,
      getPatchStatus(currentQuestionnaire, patch, selectedPatchIds, rejectedPatchIds)
    ])
  ) as Record<string, QuestionnairePatchStatus>
  const reviewablePatches = getReviewablePatches(mode, questionPatchSet)
  const reviewablePatchStatuses = reviewablePatches.map(
    patch => patchStatusMap[patch.id] || 'pending'
  )
  const hasAppliedPatchItems = reviewablePatchStatuses.some(
    patchStatus => patchStatus === 'applied'
  )
  const selectedReviewablePatchIds = reviewablePatches
    .filter(patch => patchStatusMap[patch.id] === 'selected')
    .map(patch => patch.id)
  const previewPatchIds =
    questionPatchSet?.patches
      .filter(patch => patchStatusMap[patch.id] !== 'rejected')
      .map(patch => patch.id) || []
  const previewDraft =
    questionPatchSet && questionPatchSet.patches.length > 0
      ? applyQuestionnairePatchSet({
          questionnaire: questionPatchSet.baseQuestionnaire,
          patchSet: questionPatchSet,
          selectedPatchIds: previewPatchIds
        }).questionnaire
      : finalDraft || draftPartial
  const isPartialDraft = Boolean(previewDraft && !finalDraft)
  const showAppliedQuestionnaire = draftApplied && !previewDraft
  const showCurrentQuestionnaireFallback =
    !previewDraft &&
    Boolean(
      currentComponents.length > 0 ||
        currentQuestionnaire.title ||
        currentQuestionnaire.description ||
        currentQuestionnaire.footerText
    )
  const allPatchChangesHandled =
    Boolean(questionPatchSet?.patches.length) &&
    reviewablePatchStatuses.every(
      patchStatus => patchStatus === 'applied' || patchStatus === 'rejected'
    )
  const hasSelectedPatchItems = selectedReviewablePatchIds.length > 0
  const allReviewablePatchesSelected =
    reviewablePatches.length > 0 && selectedReviewablePatchIds.length === reviewablePatches.length
  const hasSingleReviewablePatch = reviewablePatches.length === 1
  const canApplyDraft = Boolean(
    (reviewablePatches.length
      ? hasSelectedPatchItems
      : finalDraft || (status === 'cancelled' ? draftPartial : null)) &&
      !draftApplied &&
      !reviewActionsDisabled
  )
  const previewEntries = useMemo(
    () =>
      previewDraft
        ? buildAiPreviewCardEntries({
            mode,
            currentQuestionnaire,
            previewDraft,
            selectedId,
            patchStatusMap,
            isPartialDraft
          })
        : [],
    [currentQuestionnaire, isPartialDraft, mode, patchStatusMap, previewDraft, selectedId]
  )
  const appliedEntries = useMemo(
    () =>
      buildReadonlyPreviewEntries({
        questionnaire: currentQuestionnaire,
        selectedId,
        note: '该内容已应用到编辑器',
        cardIdPrefix: 'applied'
      }),
    [currentQuestionnaire, selectedId]
  )
  const currentEntries = useMemo(
    () =>
      buildReadonlyPreviewEntries({
        questionnaire: currentQuestionnaire,
        selectedId,
        note: mode === 'edit' ? '这是当前问卷内容' : 'AI 会基于这份问卷继续新增内容',
        cardIdPrefix: 'current'
      }),
    [currentQuestionnaire, mode, selectedId]
  )
  const hasDraftPreview = Boolean(previewDraft)
  const hasVisibleContent = previewEntries.length > 0
  const {
    containerRef,
    getCardRef,
    handleCardInteraction,
    handleJumpToLatest,
    showJumpToLatest,
    containerEventHandlers
  } = useAiPreviewAutoFollow({
    entries: previewEntries,
    active: hasDraftPreview && hasVisibleContent
  })
  const displayTitle =
    mode === 'generate' && currentComponents.length === 0 && previewDraft
      ? previewDraft.title || '未命名问卷'
      : currentQuestionnaire.title || previewDraft?.title || '未命名问卷'
  const displayDescription =
    mode === 'generate' && currentComponents.length === 0 && previewDraft
      ? previewDraft.description || '暂无描述'
      : currentQuestionnaire.description || previewDraft?.description || '暂无描述'
  const displayFooterText =
    mode === 'generate' && currentComponents.length === 0 && previewDraft
      ? previewDraft.footerText
      : currentQuestionnaire.footerText
  const applyButtonLabel = draftApplied
    ? '已应用'
    : isApplyingDraft
    ? '应用并保存中...'
    : reviewablePatches.length
    ? allPatchChangesHandled
      ? '已处理完成'
      : hasSingleReviewablePatch
      ? '接受'
      : allReviewablePatchesSelected
      ? '应用全部'
      : hasSelectedPatchItems
      ? `应用剩余 ${selectedReviewablePatchIds.length} 项`
      : '请选择要应用的建议'
    : isCancelledPartialDraft
    ? '应用已生成部分'
    : '应用到编辑器'

  const renderEmptyState = (description: string) => (
    <div className="mt-5 flex min-h-[320px] items-center justify-center rounded-3xl border-2 border-dashed border-custom-bg-200 bg-white/90">
      <Empty description={description} />
    </div>
  )

  const renderQuestionnaireCard = ({
    title,
    description,
    footerText,
    entries,
    emptyDescription,
    topBanner
  }: {
    title: string
    description: string
    footerText?: string
    entries: ReturnType<typeof buildReadonlyPreviewEntries>
    emptyDescription: string
    topBanner?: React.ReactNode
  }) => (
    <div className="rounded-[28px] border border-custom-bg-200 bg-white/80 p-5 shadow-inner">
      {topBanner}
      <div className="border-b border-custom-bg-200 pb-4 text-center">
        <div className="text-[26px] font-semibold tracking-[0.02em] text-custom-primary-200">
          {title}
        </div>
        <div className="mt-2 text-sm text-custom-text-200">{description}</div>
      </div>

      {entries.length > 0 ? (
        <AiInlinePreviewCardList
          entries={entries}
          reviewActionsDisabled={reviewActionsDisabled}
          onSelectComponent={onSelectComponent}
          onApplyPatch={onApplyPatch}
          onRejectPatch={onRejectPatch}
          getCardRef={getCardRef}
          onCardInteract={handleCardInteraction}
        />
      ) : (
        renderEmptyState(emptyDescription)
      )}

      {footerText && (
        <div className="pt-5 text-center text-sm text-custom-text-200">{footerText}</div>
      )}
    </div>
  )

  return (
    <div className="relative h-full flex flex-col overflow-hidden rounded-[22px] border border-custom-bg-200 bg-white/75 shadow-sm">
      <AiInlinePreviewHeader
        mode={mode}
        hasExistingQuestionnaireContent={currentComponents.length > 0}
        allPatchChangesHandled={allPatchChangesHandled}
        hasAppliedPatchItems={hasAppliedPatchItems}
        selectedPatchIdsLength={selectedReviewablePatchIds.length}
        patchCount={reviewablePatches.length}
        draftApplied={draftApplied}
        canApplyDraft={canApplyDraft}
        applyButtonLabel={applyButtonLabel}
        previewDraftExists={Boolean(previewDraft)}
        errorMessage={errorMessage}
        actionsDisabled={reviewActionsDisabled}
        onBack={onBack}
        onDiscard={onDiscard}
        onApply={onApply}
        onSelectAllPatches={onSelectAllPatches}
        onClearPatchSelection={onClearPatchSelection}
      />

      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto bg-white/30 px-4 py-4 custom-no-scrollbar"
        {...containerEventHandlers}
      >
        <div className="sticky top-0 z-40 mb-4 space-y-2">
          <AiDraftContextHint
            mode={mode}
            currentComponents={currentComponents}
            selectedId={selectedId}
            generateBaseComponentCount={
              questionPatchSet?.baseQuestionnaire.components.length ?? null
            }
            generateReviewCompleted={allPatchChangesHandled}
          />

          {errorMessage ? (
            <Alert
              className="shadow-sm"
              type="error"
              showIcon
              message="AI 草稿生成失败"
              description={errorMessage}
              closable={mode === 'generate'}
            />
          ) : warningMessage ? (
            <Alert
              className="shadow-sm"
              type="warning"
              showIcon
              message="AI 已跳过部分解析失败的题目"
              description={warningMessage}
              closable={mode === 'generate'}
            />
          ) : null}
        </div>

        {mode === 'edit' && previewDraft && (
          <PageConfigSuggestion
            currentQuestionnaire={currentQuestionnaire}
            previewQuestionnaire={previewDraft}
            extra={
              questionPatchSet?.patches.find(patch => patch.id === 'page_config') ? (
                <PatchActionButtons
                  status={patchStatusMap.page_config || 'pending'}
                  onAccept={() => onApplyPatch('page_config')}
                  onReject={() => onRejectPatch('page_config')}
                  disabled={reviewActionsDisabled}
                />
              ) : null
            }
          />
        )}

        {hasDraftPreview
          ? renderQuestionnaireCard({
              title: displayTitle,
              description: displayDescription,
              footerText: displayFooterText,
              entries: previewEntries,
              emptyDescription:
                mode === 'generate' && isStreaming
                  ? 'AI 正在生成问卷草稿，内容会持续显示在这里'
                  : mode === 'generate'
                  ? '左侧输入需求后，可先点“润色”，也可直接点“发送”；开始生成后这里会显示 AI 问卷草稿'
                  : '左侧输入修改指令后，AI 建议会直接标注在原问卷对应位置'
            })
          : showAppliedQuestionnaire
          ? renderQuestionnaireCard({
              title: currentQuestionnaire.title || '未命名问卷',
              description: currentQuestionnaire.description || '暂无描述',
              footerText: currentQuestionnaire.footerText,
              entries: appliedEntries,
              emptyDescription: '草稿已应用，当前问卷暂无题目',
              topBanner: (
                <div className="mb-4 rounded-3xl border border-[#CFEAE4] bg-white/80 px-4 py-3 text-sm text-custom-text-100 shadow-sm">
                  当前展示的是已应用到编辑器的最新内容。
                </div>
              )
            })
          : showCurrentQuestionnaireFallback
          ? renderQuestionnaireCard({
              title: currentQuestionnaire.title || '未命名问卷',
              description: currentQuestionnaire.description || '暂无描述',
              footerText: currentQuestionnaire.footerText,
              entries: currentEntries,
              emptyDescription:
                mode === 'edit'
                  ? '当前问卷暂无题目，输入修改指令后 AI 建议会显示在这里'
                  : '当前问卷暂无题目，切到生成模式后 AI 新增内容会显示在这里'
            })
          : renderEmptyState(
              mode === 'generate' && isStreaming
                ? 'AI 正在生成问卷草稿，内容会持续显示在这里'
                : mode === 'generate'
                ? '左侧输入需求后，可先点“润色”，也可直接点“发送”；开始生成后这里会显示 AI 问卷草稿'
                : '左侧输入修改指令后，AI 建议会直接标注在原问卷对应位置'
            )}
      </div>

      {showJumpToLatest ? (
        <div className="pointer-events-none absolute bottom-6 right-6 z-30">
          <Button
            type="primary"
            size="small"
            className="pointer-events-auto rounded-full shadow-lg"
            onClick={handleJumpToLatest}
          >
            回到最新建议
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export default AiInlineQuestionnairePreview
