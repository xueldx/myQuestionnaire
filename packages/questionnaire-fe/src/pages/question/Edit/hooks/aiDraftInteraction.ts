import { AiCopilotIntent } from '@/pages/question/Edit/components/aiCopilotTypes'

type ComposerGuideOptions = {
  mode: AiCopilotIntent
  hasPendingDraft: boolean
  hasQuestionnaireContent: boolean
}

export type ComposerGuide = {
  targetLabel: string
  effectLabel: string
  placeholder: string
  tone: 'info' | 'warning'
  modeLabels: Record<AiCopilotIntent, string>
}

export const getComposerGuide = ({
  mode,
  hasPendingDraft,
  hasQuestionnaireContent
}: ComposerGuideOptions): ComposerGuide => {
  if (hasPendingDraft) {
    if (mode === 'edit') {
      return {
        targetLabel: 'AI 草稿（未应用）',
        effectLabel: '发送后会继续修改这份草稿，不会改动正式问卷',
        placeholder: '继续描述你想怎么调整这份草稿，例如：把第 3 题改成多选，并补一题开放建议题',
        tone: 'info',
        modeLabels: {
          generate: '重新生成',
          edit: '继续修改'
        }
      }
    }

    return {
      targetLabel: 'AI 草稿（未应用）',
      effectLabel: '发送后会基于当前 AI 草稿继续追加内容，正式问卷不会立刻变化',
      placeholder: '继续描述你想补充的题目需求，例如：在满意度题后再补两道开放建议题',
      tone: 'info',
      modeLabels: {
        generate: '继续追加',
        edit: '继续修改'
      }
    }
  }

  if (mode === 'generate') {
    return {
      targetLabel: '正式问卷',
      effectLabel: hasQuestionnaireContent
        ? '发送后会基于正式问卷继续生成新增内容草稿'
        : '发送后会生成一份新的 AI 草稿',
      placeholder:
        '请输入原始需求，例如：想做一份门店服务满意度问卷，最好有基础信息、服务体验和建议题',
      tone: 'info',
      modeLabels: {
        generate: '生成',
        edit: '修改'
      }
    }
  }

  return {
    targetLabel: '正式问卷',
    effectLabel: '发送后会基于正式问卷生成修改建议',
    placeholder: '请输入你的修改需求，例如：把第 3 题改成多选',
    tone: 'info',
    modeLabels: {
      generate: '生成',
      edit: '修改'
    }
  }
}

export const shouldConfirmDraftRegenerate = ({
  mode,
  hasPendingDraft
}: Pick<ComposerGuideOptions, 'mode' | 'hasPendingDraft'>) => {
  return hasPendingDraft && mode === 'generate'
}
