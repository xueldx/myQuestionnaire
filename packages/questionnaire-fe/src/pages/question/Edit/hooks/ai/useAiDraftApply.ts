import { useCallback } from 'react'
import { resetComponents } from '@/store/modules/componentsSlice'
import { resetPageConfig } from '@/store/modules/pageConfigSlice'
import { normalizeQuestionnaireComponentList } from '@/utils/normalizeQuestionComponent'
import { AiCopilotIntent, DraftSummary, QuestionnaireDraft } from '../../components/aiCopilotTypes'
import { DraftApplyPayload } from './aiShared'

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
  version: number
  selectedId: string
  componentList: QuestionnaireDraft['components']
  pageConfig: Pick<QuestionnaireDraft, 'title' | 'description' | 'footerText'>
  finalDraft: QuestionnaireDraft | null
  draftApplied: boolean
  baseVersionRef: { current: number }
  dispatch: (action: any) => void
  message: MessageApi
  modal: ModalApi
  clearDraftAfterApply: () => void
  persistConversationDraftState: (payload: {
    lastInstruction?: string | null
    latestDraft?: QuestionnaireDraft | null
    latestSummary?: DraftSummary | null
  }) => Promise<void>
  onDraftApplied?: (payload: DraftApplyPayload) => Promise<void> | void
  setDraftApplied: (value: boolean) => void
}

export const useAiDraftApply = ({
  mode,
  version,
  selectedId,
  componentList,
  pageConfig,
  finalDraft,
  draftApplied,
  baseVersionRef,
  dispatch,
  message,
  modal,
  clearDraftAfterApply,
  persistConversationDraftState,
  onDraftApplied,
  setDraftApplied
}: UseAiDraftApplyParams) => {
  const applyGenerateDraft = useCallback(
    async (draft: QuestionnaireDraft) => {
      const normalizedComponents = normalizeQuestionnaireComponentList(draft.components)

      if (normalizedComponents.length === 0) {
        message.warning('当前 AI 草稿中没有可插入的组件')
        return
      }

      const nextSelectedId =
        normalizedComponents.find(component => component.fe_id === selectedId)?.fe_id ||
        normalizedComponents[0]?.fe_id ||
        ''

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
      void persistConversationDraftState({
        lastInstruction: null,
        latestDraft: null,
        latestSummary: null
      })

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
      message,
      onDraftApplied,
      pageConfig,
      persistConversationDraftState,
      selectedId,
      setDraftApplied,
      version
    ]
  )

  const applyEditDraft = useCallback(
    async (draft: QuestionnaireDraft) => {
      const normalizedComponents = normalizeQuestionnaireComponentList(draft.components)
      const nextSelectedId =
        normalizedComponents.find(component => component.fe_id === selectedId)?.fe_id ||
        normalizedComponents[0]?.fe_id ||
        ''

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
      void persistConversationDraftState({
        lastInstruction: null,
        latestDraft: null,
        latestSummary: null
      })

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
      message,
      onDraftApplied,
      persistConversationDraftState,
      selectedId,
      setDraftApplied,
      version
    ]
  )

  const applyDraft = useCallback(async () => {
    if (!finalDraft) {
      message.warning('请先等待 AI 生成最终草稿')
      return
    }

    if (draftApplied) {
      message.info('本轮草稿已经应用过了，如需继续生成请重新发送需求')
      return
    }

    if (mode === 'generate') {
      await applyGenerateDraft(finalDraft)
      return
    }

    if (version === baseVersionRef.current) {
      await applyEditDraft(finalDraft)
      return
    }

    modal.confirm({
      title: '检测到问卷已发生变更',
      content: 'AI 草稿生成期间，你又修改了当前问卷。是否仍然覆盖当前编辑结果？',
      okText: '覆盖应用',
      cancelText: '放弃本次草稿',
      onOk: async () => {
        await applyEditDraft(finalDraft)
      }
    })
  }, [
    applyEditDraft,
    applyGenerateDraft,
    baseVersionRef,
    draftApplied,
    finalDraft,
    message,
    modal,
    mode,
    version
  ])

  return {
    applyDraft
  }
}
