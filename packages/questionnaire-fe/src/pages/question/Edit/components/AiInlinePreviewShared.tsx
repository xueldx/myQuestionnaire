import React from 'react'
import { Button, Tag } from 'antd'
import ComponentRender from '@/pages/question/Edit/components/ComponentRender'
import { ComponentInfoType } from '@/store/modules/componentsSlice'
import { QuestionnaireDraft } from './aiCopilotTypes'
import { QuestionnairePatchStatus } from '../hooks/aiQuestionPatch'

export type AnnotationTone = 'current' | 'suggestion' | 'danger' | 'info' | 'anchor'

const stringifyValue = (value: unknown) => JSON.stringify(value ?? null)

export const hasComponentChanged = (current: ComponentInfoType, next: ComponentInfoType) => {
  return (
    current.type !== next.type ||
    current.title !== next.title ||
    stringifyValue(current.props) !== stringifyValue(next.props)
  )
}

export const buildAddedInsertMap = (
  currentComponents: ComponentInfoType[],
  draftComponents: ComponentInfoType[]
) => {
  const currentIds = new Set(currentComponents.map(component => component.fe_id))
  const insertMap = new Map<string, ComponentInfoType[]>()
  let anchorKey = '__start__'

  draftComponents.forEach(component => {
    if (currentIds.has(component.fe_id)) {
      anchorKey = component.fe_id
      return
    }

    const targetList = insertMap.get(anchorKey) || []
    targetList.push(component)
    insertMap.set(anchorKey, targetList)
  })

  return insertMap
}

interface PreviewCardProps {
  label: string
  note?: string
  tone?: AnnotationTone
  component: ComponentInfoType
  extra?: React.ReactNode
}

const toneClassNameMap: Record<AnnotationTone, string> = {
  current: 'border-custom-bg-200 bg-white',
  suggestion: 'border-[#92D7CB] bg-[#F5FFFC]',
  danger: 'border-[#F6C8C3] bg-[#FFF7F5]',
  info: 'border-[#CFE2FF] bg-[#F7FAFF]',
  anchor: 'border-[#F7D9A7] bg-[#FFF9ED]'
}

const tagClassNameMap: Record<AnnotationTone, string> = {
  current: 'bg-custom-bg-100 text-custom-text-200',
  suggestion: 'bg-[#DDF5EF] text-[#0F766E]',
  danger: 'bg-[#FDE7E4] text-[#C2410C]',
  info: 'bg-[#E7F0FF] text-[#1D4ED8]',
  anchor: 'bg-[#FDE7C7] text-[#9A6700]'
}

export const PreviewCard: React.FC<PreviewCardProps> = ({
  label,
  note,
  tone = 'current',
  component,
  extra
}) => {
  return (
    <div className={`rounded-3xl border px-4 py-4 shadow-sm ${toneClassNameMap[tone]}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tagClassNameMap[tone]}`}
          >
            {label}
          </span>
          {note && <span className="text-xs text-custom-text-200">{note}</span>}
        </div>
        {extra}
      </div>
      <div className="pointer-events-none select-none">
        <ComponentRender component={component} />
      </div>
    </div>
  )
}

export const PageConfigSuggestion: React.FC<{
  currentQuestionnaire: QuestionnaireDraft
  previewQuestionnaire: QuestionnaireDraft
  extra?: React.ReactNode
}> = ({ currentQuestionnaire, previewQuestionnaire, extra }) => {
  const titleChanged = currentQuestionnaire.title !== previewQuestionnaire.title
  const descriptionChanged = currentQuestionnaire.description !== previewQuestionnaire.description
  const footerChanged = currentQuestionnaire.footerText !== previewQuestionnaire.footerText

  if (!titleChanged && !descriptionChanged && !footerChanged) return null

  return (
    <div className="mb-4 rounded-3xl border border-[#CFE2FF] bg-[#F7FAFF] px-4 py-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="text-sm font-semibold text-custom-text-100">AI 建议更新问卷头部信息</div>
        {extra}
      </div>
      <div className="space-y-2 text-sm text-custom-text-100">
        {titleChanged && (
          <div>
            <div className="text-xs text-custom-text-200">标题</div>
            <div className="font-medium">{previewQuestionnaire.title || '未命名问卷'}</div>
          </div>
        )}
        {descriptionChanged && (
          <div>
            <div className="text-xs text-custom-text-200">描述</div>
            <div>{previewQuestionnaire.description || '暂无描述'}</div>
          </div>
        )}
        {footerChanged && (
          <div>
            <div className="text-xs text-custom-text-200">页脚</div>
            <div>{previewQuestionnaire.footerText || '暂无页脚'}</div>
          </div>
        )}
      </div>
    </div>
  )
}

export const PatchActionButtons: React.FC<{
  status: QuestionnairePatchStatus
  onAccept: () => void
  onReject: () => void
}> = ({ status, onAccept, onReject }) => {
  if (status === 'applied') {
    return (
      <Tag className="m-0" color="success">
        已应用
      </Tag>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="small" type="primary" onClick={onAccept}>
        接受
      </Button>
      <Button
        size="small"
        danger={status !== 'rejected'}
        type={status === 'rejected' ? 'default' : 'text'}
        onClick={onReject}
      >
        {status === 'rejected' ? '恢复' : '拒绝'}
      </Button>
    </div>
  )
}
