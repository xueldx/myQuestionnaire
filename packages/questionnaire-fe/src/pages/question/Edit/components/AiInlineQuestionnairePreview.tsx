import React from 'react'
import { Alert, Empty } from 'antd'
import { ComponentInfoType } from '@/store/modules/componentsSlice'
import {
  AiCopilotIntent,
  AiStreamStatus,
  QuestionnaireDraft,
  QuestionnairePatchSet
} from './aiCopilotTypes'
import { generateDraftContainsCurrentComponents } from '@/pages/question/Edit/hooks/aiGenerateDraftMerge'
import {
  QuestionnairePatchStatus,
  applyQuestionnairePatchSet,
  getReviewablePatches,
  getPatchStatus
} from '../hooks/aiQuestionPatch'
import {
  buildAddedInsertMap,
  hasComponentChanged,
  PageConfigSuggestion,
  PatchActionButtons,
  PreviewCard
} from './AiInlinePreviewShared'
import { AiDraftContextHint } from './AiDraftBatchBar'
import AiInlinePreviewHeader from './AiInlinePreviewHeader'

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
  const draftComponents = previewDraft?.components || []
  const showCurrentQuestionnaireFallback =
    !previewDraft &&
    Boolean(
      currentComponents.length > 0 ||
        currentQuestionnaire.title ||
        currentQuestionnaire.description ||
        currentQuestionnaire.footerText
    )
  const draftIndexMap = new Map(draftComponents.map((component, index) => [component.fe_id, index]))
  const draftComponentMap = new Map(draftComponents.map(component => [component.fe_id, component]))
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
  const addedInsertMap =
    mode === 'edit' ? buildAddedInsertMap(currentComponents, draftComponents) : new Map()
  const generateDraftHasBaseComponents =
    mode === 'generate' && generateDraftContainsCurrentComponents(previewDraft, currentComponents)
  const generateAddedInsertMap =
    mode === 'generate' && generateDraftHasBaseComponents
      ? buildAddedInsertMap(currentComponents, draftComponents)
      : new Map()
  const anchorIndex =
    selectedId == null
      ? -1
      : currentComponents.findIndex(component => component.fe_id === selectedId)
  const generateInsertIndex = anchorIndex >= 0 ? anchorIndex + 1 : currentComponents.length
  const handleSelectComponent = (feId: string) => {
    if (!feId) return
    onSelectComponent(feId)
  }
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
  const streamingLabel =
    status === 'connecting'
      ? '连接中'
      : status === 'thinking'
      ? mode === 'generate'
        ? '理解需求中'
        : '分析问卷中'
      : status === 'answering'
      ? '整理说明中'
      : mode === 'generate'
      ? '草稿生成中'
      : '建议生成中'
  const hasDraftPreview = Boolean(previewDraft)
  const hasVisibleContent =
    hasDraftPreview && (currentComponents.length > 0 || draftComponents.length > 0)
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

  return (
    <div className="h-full flex flex-col overflow-hidden rounded-[22px] border border-custom-bg-200 bg-white/75 shadow-sm">
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

      <div className="flex-1 overflow-y-auto bg-white/30 px-4 py-4 custom-no-scrollbar">
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

        {hasDraftPreview ? (
          <div className="rounded-[28px] border border-custom-bg-200 bg-white/80 p-5 shadow-inner">
            <div className="border-b border-custom-bg-200 pb-4 text-center">
              <div className="text-[26px] font-semibold tracking-[0.02em] text-custom-primary-200">
                {displayTitle}
              </div>
              <div className="mt-2 text-sm text-custom-text-200">{displayDescription}</div>
            </div>

            {hasVisibleContent ? (
              <div className="mt-5 space-y-4">
                {generateDraftHasBaseComponents && generateAddedInsertMap.get('__start__')?.length
                  ? (generateAddedInsertMap.get('__start__') || []).map(
                      (component: ComponentInfoType) => (
                        <PreviewCard
                          key={`generate-start-${component.fe_id}`}
                          tone="suggestion"
                          label={`AI 建议新增（应用后第 ${
                            (draftIndexMap.get(component.fe_id) || 0) + 1
                          } 项）`}
                          note="将插入到问卷开头"
                          component={component}
                          extra={
                            <PatchActionButtons
                              status={patchStatusMap[`add:${component.fe_id}`] || 'pending'}
                              onAccept={() => onApplyPatch(`add:${component.fe_id}`)}
                              onReject={() => onRejectPatch(`add:${component.fe_id}`)}
                              disabled={reviewActionsDisabled}
                            />
                          }
                        />
                      )
                    )
                  : null}

                {mode === 'edit' && addedInsertMap.get('__start__')?.length
                  ? (addedInsertMap.get('__start__') || []).map((component: ComponentInfoType) => (
                      <PreviewCard
                        key={`start-${component.fe_id}`}
                        tone="suggestion"
                        label={`AI 建议新增（应用后第 ${
                          (draftIndexMap.get(component.fe_id) || 0) + 1
                        } 项）`}
                        note="将插入到问卷开头"
                        component={component}
                        extra={
                          <PatchActionButtons
                            status={patchStatusMap[`add:${component.fe_id}`] || 'pending'}
                            onAccept={() => onApplyPatch(`add:${component.fe_id}`)}
                            onReject={() => onRejectPatch(`add:${component.fe_id}`)}
                            disabled={reviewActionsDisabled}
                          />
                        }
                      />
                    ))
                  : null}

                {currentComponents.map((component, index) => {
                  const draftComponent = draftComponentMap.get(component.fe_id)
                  const draftPosition = draftIndexMap.get(component.fe_id)
                  const isChanged =
                    !!draftComponent &&
                    mode === 'edit' &&
                    hasComponentChanged(component, draftComponent)
                  const isDeleted = mode === 'edit' && !isPartialDraft && !draftComponent
                  const generateInsertHere = mode === 'generate' && anchorIndex === index
                  const addedAfterCurrent =
                    mode === 'edit'
                      ? addedInsertMap.get(component.fe_id) || []
                      : generateDraftHasBaseComponents
                      ? generateAddedInsertMap.get(component.fe_id) || []
                      : []

                  return (
                    <React.Fragment key={component.fe_id}>
                      <PreviewCard
                        tone={isDeleted || isChanged ? 'danger' : 'current'}
                        label={`当前第 ${index + 1} 项`}
                        note={
                          isDeleted
                            ? ''
                            : generateInsertHere
                            ? 'AI 新增内容会从这一项后面开始插入'
                            : undefined
                        }
                        component={component}
                        selected={selectedId === component.fe_id}
                        selectedAccent={mode === 'edit' && isChanged ? 'red' : 'green'}
                        onSelect={() => handleSelectComponent(component.fe_id)}
                        extra={
                          isDeleted ? (
                            <PatchActionButtons
                              status={patchStatusMap[`delete:${component.fe_id}`] || 'pending'}
                              onAccept={() => onApplyPatch(`delete:${component.fe_id}`)}
                              onReject={() => onRejectPatch(`delete:${component.fe_id}`)}
                              disabled={reviewActionsDisabled}
                            />
                          ) : undefined
                        }
                      />

                      {isChanged && draftComponent && (
                        <PreviewCard
                          tone="suggestion"
                          label={`AI 建议改为第 ${(draftPosition || 0) + 1} 项`}
                          note="下方是 AI 生成的替换内容"
                          component={draftComponent}
                          selected={selectedId === draftComponent.fe_id}
                          selectedAccent="green"
                          onSelect={() => handleSelectComponent(draftComponent.fe_id)}
                          extra={
                            <PatchActionButtons
                              status={patchStatusMap[`update:${draftComponent.fe_id}`] || 'pending'}
                              onAccept={() => onApplyPatch(`update:${draftComponent.fe_id}`)}
                              onReject={() => onRejectPatch(`update:${draftComponent.fe_id}`)}
                              disabled={reviewActionsDisabled}
                            />
                          }
                        />
                      )}

                      {addedAfterCurrent.map((addedComponent: ComponentInfoType) => (
                        <PreviewCard
                          key={`after-${addedComponent.fe_id}`}
                          tone="suggestion"
                          label={`AI 建议新增（应用后第 ${
                            (draftIndexMap.get(addedComponent.fe_id) || 0) + 1
                          } 项）`}
                          note={`将插入到当前第 ${index + 1} 项之后`}
                          component={addedComponent}
                          extra={
                            <PatchActionButtons
                              status={patchStatusMap[`add:${addedComponent.fe_id}`] || 'pending'}
                              onAccept={() => onApplyPatch(`add:${addedComponent.fe_id}`)}
                              onReject={() => onRejectPatch(`add:${addedComponent.fe_id}`)}
                              disabled={reviewActionsDisabled}
                            />
                          }
                        />
                      ))}

                      {mode === 'generate' &&
                        !generateDraftHasBaseComponents &&
                        previewDraft &&
                        index + 1 === generateInsertIndex &&
                        previewDraft.components.map((draftComponent, draftIndex) => (
                          <PreviewCard
                            key={`generate-${draftComponent.fe_id}-${draftIndex}`}
                            tone="suggestion"
                            label={`AI 建议新增（应用后第 ${
                              generateInsertIndex + draftIndex + 1
                            } 项）`}
                            note={
                              anchorIndex >= 0
                                ? `将插入到当前第 ${anchorIndex + 1} 项之后`
                                : '将追加到问卷末尾'
                            }
                            component={draftComponent}
                            extra={
                              <PatchActionButtons
                                status={patchStatusMap[`add:${draftComponent.fe_id}`] || 'pending'}
                                onAccept={() => onApplyPatch(`add:${draftComponent.fe_id}`)}
                                onReject={() => onRejectPatch(`add:${draftComponent.fe_id}`)}
                                disabled={reviewActionsDisabled}
                              />
                            }
                          />
                        ))}
                    </React.Fragment>
                  )
                })}

                {mode === 'generate' &&
                  previewDraft &&
                  currentComponents.length === 0 &&
                  previewDraft.components.map((component, index) => (
                    <PreviewCard
                      key={`generate-empty-${component.fe_id}-${index}`}
                      tone="suggestion"
                      label={`AI 建议新增（第 ${index + 1} 项）`}
                      note="应用后会直接创建到当前问卷中"
                      component={component}
                      extra={
                        <PatchActionButtons
                          status={patchStatusMap[`add:${component.fe_id}`] || 'pending'}
                          onAccept={() => onApplyPatch(`add:${component.fe_id}`)}
                          onReject={() => onRejectPatch(`add:${component.fe_id}`)}
                          disabled={reviewActionsDisabled}
                        />
                      }
                    />
                  ))}
              </div>
            ) : (
              <div className="mt-5 flex min-h-[320px] items-center justify-center rounded-3xl border-2 border-dashed border-custom-bg-200 bg-white/90">
                <Empty
                  description={
                    mode === 'generate' && isStreaming
                      ? 'AI 正在生成问卷草稿，内容会持续显示在这里'
                      : mode === 'generate'
                      ? '左侧输入需求后，可先点“润色”，也可直接点“发送”；开始生成后这里会显示 AI 问卷草稿'
                      : '左侧输入修改指令后，AI 建议会直接标注在原问卷对应位置'
                  }
                />
              </div>
            )}

            {displayFooterText && (
              <div className="pt-5 text-center text-sm text-custom-text-200">
                {displayFooterText}
              </div>
            )}
          </div>
        ) : showAppliedQuestionnaire ? (
          <div className="rounded-[28px] border border-custom-bg-200 bg-white/80 p-5 shadow-inner">
            <div className="mb-4 rounded-3xl border border-[#CFEAE4] bg-white/80 px-4 py-3 text-sm text-custom-text-100 shadow-sm">
              当前展示的是已应用到编辑器的最新内容。
            </div>
            <div className="border-b border-custom-bg-200 pb-4 text-center">
              <div className="text-[26px] font-semibold tracking-[0.02em] text-custom-primary-200">
                {currentQuestionnaire.title || '未命名问卷'}
              </div>
              <div className="mt-2 text-sm text-custom-text-200">
                {currentQuestionnaire.description || '暂无描述'}
              </div>
            </div>
            {currentComponents.length > 0 ? (
              <div className="mt-5 space-y-4">
                {currentComponents.map((component, index) => (
                  <PreviewCard
                    key={`applied-${component.fe_id}-${index}`}
                    tone="current"
                    label={`当前第 ${index + 1} 项`}
                    note="该内容已应用到编辑器"
                    component={component}
                    selected={selectedId === component.fe_id}
                    onSelect={() => handleSelectComponent(component.fe_id)}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-5 flex min-h-[320px] items-center justify-center rounded-3xl border-2 border-dashed border-custom-bg-200 bg-white/90">
                <Empty description="草稿已应用，当前问卷暂无题目" />
              </div>
            )}
            {currentQuestionnaire.footerText && (
              <div className="pt-5 text-center text-sm text-custom-text-200">
                {currentQuestionnaire.footerText}
              </div>
            )}
          </div>
        ) : showCurrentQuestionnaireFallback ? (
          <div className="rounded-[28px] border border-custom-bg-200 bg-white/80 p-5 shadow-inner">
            <div className="border-b border-custom-bg-200 pb-4 text-center">
              <div className="text-[26px] font-semibold tracking-[0.02em] text-custom-primary-200">
                {currentQuestionnaire.title || '未命名问卷'}
              </div>
              <div className="mt-2 text-sm text-custom-text-200">
                {currentQuestionnaire.description || '暂无描述'}
              </div>
            </div>
            {currentComponents.length > 0 ? (
              <div className="mt-5 space-y-4">
                {currentComponents.map((component, index) => (
                  <PreviewCard
                    key={`current-edit-${component.fe_id}-${index}`}
                    tone="current"
                    label={`当前第 ${index + 1} 项`}
                    note={mode === 'edit' ? '这是当前问卷内容' : 'AI 会基于这份问卷继续新增内容'}
                    component={component}
                    selected={selectedId === component.fe_id}
                    onSelect={() => handleSelectComponent(component.fe_id)}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-5 flex min-h-[320px] items-center justify-center rounded-3xl border-2 border-dashed border-custom-bg-200 bg-white/90">
                <Empty
                  description={
                    mode === 'edit'
                      ? '当前问卷暂无题目，输入修改指令后 AI 建议会显示在这里'
                      : '当前问卷暂无题目，切到生成模式后 AI 新增内容会显示在这里'
                  }
                />
              </div>
            )}
            {currentQuestionnaire.footerText && (
              <div className="pt-5 text-center text-sm text-custom-text-200">
                {currentQuestionnaire.footerText}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-5 flex min-h-[320px] items-center justify-center rounded-3xl border-2 border-dashed border-custom-bg-200 bg-white/90">
            <Empty
              description={
                mode === 'generate' && isStreaming
                  ? 'AI 正在生成问卷草稿，内容会持续显示在这里'
                  : mode === 'generate'
                  ? '左侧输入需求后，可先点“润色”，也可直接点“发送”；开始生成后这里会显示 AI 问卷草稿'
                  : '左侧输入修改指令后，AI 建议会直接标注在原问卷对应位置'
              }
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default AiInlineQuestionnairePreview
