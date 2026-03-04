import { useCallback } from 'react'
import { resetComponents } from '@/store/modules/componentsSlice'
import { resetPageConfig } from '@/store/modules/pageConfigSlice'
import { normalizeQuestionnaireComponentList } from '@/utils/normalizeQuestionComponent'
import {
  AiCopilotIntent,
  QuestionnaireDraft,
  QuestionnairePatchSet
} from '../../components/aiCopilotTypes'
import {
  DraftApplyPayload,
  PersistConversationDraftStateOptions,
  PersistConversationDraftStatePayload
} from './aiShared'
import { applyQuestionnairePatchSet, isPatchAppliedToQuestionnaire } from '../aiQuestionPatch'
import { reportAiMetricOutcome } from './aiMetricOutcome'

type MessageApi = {
  warning: (content: string) => void
  info: (content: string) => void
  success: (content: string) => void
}

type ModalApi = {
  confirm: (config: {
    title: string
    content: string
    okText?: string
    cancelText?: string
    onOk?: () => void | Promise<void>
  }) => void
}

type UseAiDraftApplyParams = {
  mode: AiCopilotIntent
  status: 'draft_ready' | 'done' | 'cancelled' | string
  requestId: string | null
  version: number
  selectedId: string
  componentList: QuestionnaireDraft['components']
  pageConfig: Pick<QuestionnaireDraft, 'title' | 'description' | 'footerText'>
  draftPartial: QuestionnaireDraft | null
  finalDraft: QuestionnaireDraft | null
  draftApplied: boolean
  questionPatchSet: QuestionnairePatchSet | null
  selectedPatchIds: string[]
  rejectedPatchIds: string[]
  baseVersionRef: { current: number }
  dispatch: (action: any) => void
  message: MessageApi
  modal: ModalApi
  clearDraftAfterApply: () => void
  persistConversationDraftState: (
    payload: PersistConversationDraftStatePayload,
    options?: PersistConversationDraftStateOptions
  ) => Promise<boolean>
  onDraftApplied?: (payload: DraftApplyPayload) => Promise<void> | void
  setDraftApplied: (value: boolean) => void
}

export const useAiDraftApply = ({
  mode,
  status,
  requestId,
  version,
  selectedId,
  componentList,
  pageConfig,
  draftPartial,
  finalDraft,
  draftApplied,
  questionPatchSet,
  selectedPatchIds,
  rejectedPatchIds,
  baseVersionRef,
  dispatch,
  message,
  modal,
  clearDraftAfterApply,
  persistConversationDraftState,
  onDraftApplied,
  setDraftApplied
}: UseAiDraftApplyParams) => {
  const isInterruptedPreviewOnly = status === 'background_running' || status === 'resume_available'
  const applicableDraft = finalDraft || (status === 'cancelled' ? draftPartial : null)
  const effectiveSelectedPatchIds = selectedPatchIds.filter(
    patchId => !rejectedPatchIds.includes(patchId)
  )
  const selectedPatches =
    questionPatchSet?.patches.filter(patch => effectiveSelectedPatchIds.includes(patch.id)) || []
  const currentQuestionnaire: QuestionnaireDraft = {
    title: pageConfig.title,
    description: pageConfig.description,
    footerText: pageConfig.footerText,
    components: componentList
  }
  const resolveNextSelectedId = useCallback(
    (
      normalizedComponents: QuestionnaireDraft['components'],
      options?: {
        keepEmptyWhenUnmatched?: boolean
      }
    ) => {
      const matchedSelectedId = normalizedComponents.find(
        component => component.fe_id === selectedId
      )?.fe_id

      if (matchedSelectedId) return matchedSelectedId
      if (options?.keepEmptyWhenUnmatched) return ''
      return normalizedComponents[0]?.fe_id || ''
    },
    [selectedId]
  )

  const applyPatchSelection = useCallback(
    async (patchIds = effectiveSelectedPatchIds) => {
      if (isInterruptedPreviewOnly) {
        message.warning('当前中断草稿仅供预览，请先恢复本轮或放弃后再继续。')
        return []
      }

      const safePatchIds = patchIds.filter(patchId => !rejectedPatchIds.includes(patchId))

      if (!questionPatchSet || safePatchIds.length === 0) {
        message.warning('请至少选择一项 AI 变更后再应用')
        return []
      }

      const {
        questionnaire: nextQuestionnaire,
        appliedPatchIds,
        skippedPatchIds
      } = applyQuestionnairePatchSet({
        questionnaire: currentQuestionnaire,
        patchSet: questionPatchSet,
        selectedPatchIds: safePatchIds
      })

      if (appliedPatchIds.length === 0) {
        message.warning('当前所选变更无法应用，请刷新问卷后重试')
        return []
      }

      const normalizedComponents = normalizeQuestionnaireComponentList(nextQuestionnaire.components)
      const nextSelectedId = resolveNextSelectedId(normalizedComponents, {
        keepEmptyWhenUnmatched:
          mode === 'generate' && questionPatchSet.baseQuestionnaire.components.length === 0
      })

      dispatch(
        resetComponents({
          selectedId: nextSelectedId,
          componentList: normalizedComponents,
          version
        })
      )

      dispatch(
        resetPageConfig({
          title: nextQuestionnaire.title,
          description: nextQuestionnaire.description,
          footerText: nextQuestionnaire.footerText
        })
      )

      const allPatchChangesApplied = questionPatchSet.patches.every(patch =>
        isPatchAppliedToQuestionnaire(nextQuestionnaire, patch)
      )

      setDraftApplied(allPatchChangesApplied)
      void reportAiMetricOutcome(requestId, {
        draftApplied: true
      })

      if (allPatchChangesApplied) {
        void persistConversationDraftState(
          {
            lastInstruction: null,
            latestDraft: null,
            latestSummary: null,
            latestBaseQuestionnaire: null,
            latestBatches: null,
            lastRuntimeStatus: 'done',
            lastWorkflowStage: mode
          },
          {
            silent: false,
            failureMessage: '同步 AI 会话完成状态失败，请刷新后确认。'
          }
        )
      }

      const successMessage =
        safePatchIds.length === questionPatchSet.patches.length - rejectedPatchIds.length
          ? 'AI 变更已应用到编辑器'
          : `已应用 ${appliedPatchIds.length} 项已选变更`

      if (onDraftApplied) {
        await onDraftApplied({
          questionnaire: {
            ...nextQuestionnaire,
            components: normalizedComponents
          },
          version,
          successMessage:
            skippedPatchIds.length > 0
              ? `${successMessage}，另有 ${skippedPatchIds.length} 项因问卷已变化被跳过`
              : successMessage
        })
        return appliedPatchIds
      }

      if (skippedPatchIds.length > 0) {
        message.warning(`${successMessage}，另有 ${skippedPatchIds.length} 项因问卷已变化被跳过`)
        return appliedPatchIds
      }

      message.success(successMessage)
      return appliedPatchIds
    },
    [
      currentQuestionnaire,
      dispatch,
      isInterruptedPreviewOnly,
      message,
      onDraftApplied,
      questionPatchSet,
      rejectedPatchIds,
      requestId,
      resolveNextSelectedId,
      selectedId,
      setDraftApplied,
      mode,
      version
    ]
  )

  const applyGenerateDraft = useCallback(
    async (draft: QuestionnaireDraft) => {
      if (isInterruptedPreviewOnly) {
        message.warning('当前中断草稿仅供预览，请先恢复本轮或放弃后再继续。')
        return
      }

      const normalizedComponents = normalizeQuestionnaireComponentList(draft.components)

      if (normalizedComponents.length === 0) {
        message.warning('当前 AI 草稿中没有可插入的组件')
        return
      }

      const nextSelectedId = resolveNextSelectedId(normalizedComponents, {
        keepEmptyWhenUnmatched: mode === 'generate' && componentList.length === 0
      })

      dispatch(
        resetComponents({
          selectedId: nextSelectedId,
          componentList: normalizedComponents,
          version
        })
      )

      if (componentList.length === 0) {
        dispatch(
          resetPageConfig({
            title: draft.title,
            description: draft.description,
            footerText: draft.footerText
          })
        )
      }

      const nextQuestionnaire: QuestionnaireDraft =
        componentList.length === 0
          ? {
              title: draft.title,
              description: draft.description,
              footerText: draft.footerText,
              components: normalizedComponents
            }
          : {
              title: pageConfig.title,
              description: pageConfig.description,
              footerText: pageConfig.footerText,
              components: normalizedComponents
            }
      const successMessage =
        componentList.length === 0 ? 'AI 生成的问卷已应用到编辑器' : 'AI 生成的组件已插入当前问卷'

      setDraftApplied(true)
      clearDraftAfterApply()
      void reportAiMetricOutcome(requestId, {
        draftApplied: true
      })
      void persistConversationDraftState(
        {
          lastInstruction: null,
          latestDraft: null,
          latestSummary: null,
          latestBaseQuestionnaire: null,
          latestBatches: null,
          lastRuntimeStatus: 'done',
          lastWorkflowStage: 'generate'
        },
        {
          silent: false,
          failureMessage: '同步已应用的 AI 草稿状态失败，请刷新后确认。'
        }
      )

      if (onDraftApplied) {
        await onDraftApplied({
          questionnaire: nextQuestionnaire,
          version,
          successMessage
        })
        return
      }

      message.success(successMessage)
    },
    [
      clearDraftAfterApply,
      componentList,
      dispatch,
      isInterruptedPreviewOnly,
      message,
      onDraftApplied,
      pageConfig,
      persistConversationDraftState,
      requestId,
      resolveNextSelectedId,
      setDraftApplied,
      mode,
      version
    ]
  )

  const applyEditDraft = useCallback(
    async (draft: QuestionnaireDraft) => {
      if (isInterruptedPreviewOnly) {
        message.warning('当前中断草稿仅供预览，请先恢复本轮或放弃后再继续。')
        return
      }

      const normalizedComponents = normalizeQuestionnaireComponentList(draft.components)
      const nextSelectedId = resolveNextSelectedId(normalizedComponents)

      dispatch(
        resetComponents({
          selectedId: nextSelectedId,
          componentList: normalizedComponents,
          version
        })
      )

      dispatch(
        resetPageConfig({
          title: draft.title,
          description: draft.description,
          footerText: draft.footerText
        })
      )

      const nextQuestionnaire: QuestionnaireDraft = {
        title: draft.title,
        description: draft.description,
        footerText: draft.footerText,
        components: normalizedComponents
      }

      setDraftApplied(true)
      clearDraftAfterApply()
      void reportAiMetricOutcome(requestId, {
        draftApplied: true
      })
      void persistConversationDraftState(
        {
          lastInstruction: null,
          latestDraft: null,
          latestSummary: null,
          latestBaseQuestionnaire: null,
          latestBatches: null,
          lastRuntimeStatus: 'done',
          lastWorkflowStage: 'edit'
        },
        {
          silent: false,
          failureMessage: '同步已应用的 AI 草稿状态失败，请刷新后确认。'
        }
      )

      if (onDraftApplied) {
        await onDraftApplied({
          questionnaire: nextQuestionnaire,
          version,
          successMessage: 'AI 草稿已应用到编辑器'
        })
        return
      }

      message.success('AI 草稿已应用到编辑器')
    },
    [
      clearDraftAfterApply,
      dispatch,
      isInterruptedPreviewOnly,
      message,
      onDraftApplied,
      persistConversationDraftState,
      requestId,
      resolveNextSelectedId,
      setDraftApplied,
      version
    ]
  )

  const applyDraft = useCallback(async () => {
    if (isInterruptedPreviewOnly) {
      message.warning('当前中断草稿仅供预览，请先恢复本轮或放弃后再继续。')
      return
    }

    if (!applicableDraft) {
      message.warning('当前没有可应用的草稿')
      return
    }

    if (draftApplied) {
      message.info('本轮草稿已经应用过了，如需继续生成请重新发送需求')
      return
    }

    if (questionPatchSet && questionPatchSet.patches.length > 0) {
      const shouldConfirmPatchApply =
        mode === 'edit' &&
        version !== baseVersionRef.current &&
        selectedPatches.some(patch => patch.type !== 'add')

      if (!shouldConfirmPatchApply) {
        await applyPatchSelection()
        return
      }

      modal.confirm({
        title: '检测到问卷已发生变更',
        content: '所选 AI 变更会覆盖对应题目或问卷头部配置，是否继续应用？',
        okText: '继续应用',
        cancelText: '取消',
        onOk: async () => {
          await applyPatchSelection(effectiveSelectedPatchIds)
        }
      })
      return
    }

    if (mode === 'generate') {
      await applyGenerateDraft(applicableDraft)
      return
    }

    if (version === baseVersionRef.current) {
      await applyEditDraft(applicableDraft)
      return
    }

    modal.confirm({
      title: '检测到问卷已发生变更',
      content: 'AI 草稿生成期间，你又修改了当前问卷。是否仍然覆盖当前编辑结果？',
      okText: '覆盖应用',
      cancelText: '放弃本次草稿',
      onOk: async () => {
        await applyEditDraft(applicableDraft)
      }
    })
  }, [
    applicableDraft,
    applyEditDraft,
    applyGenerateDraft,
    applyPatchSelection,
    baseVersionRef,
    draftApplied,
    isInterruptedPreviewOnly,
    message,
    modal,
    mode,
    questionPatchSet,
    effectiveSelectedPatchIds,
    selectedPatches,
    version
  ])

  return {
    applyDraft,
    applyPatchSelection
  }
}
