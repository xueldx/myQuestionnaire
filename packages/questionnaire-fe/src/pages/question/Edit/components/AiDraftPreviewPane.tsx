import React from 'react'
import { Alert, Button, Empty, Skeleton, Space, Tag } from 'antd'
import { DraftSummary, QuestionnaireDraft, AiCopilotIntent, AiStreamStatus } from './aiCopilotTypes'
import QuestionnairePreview from './QuestionnairePreview'

interface AiDraftPreviewPaneProps {
  mode: AiCopilotIntent
  status: AiStreamStatus
  draftPartial: QuestionnaireDraft | null
  finalDraft: QuestionnaireDraft | null
  summary: DraftSummary | null
  errorMessage: string | null
  onApply: () => void
  onDiscard: () => void
}

const SummaryTags: React.FC<{ label: string; color: string; values: string[] }> = ({
  label,
  color,
  values
}) => {
  if (!values.length) return null

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-custom-text-200">
        {label}
      </div>
      <div className="flex flex-wrap gap-2">
        {values.map(value => (
          <Tag key={`${label}-${value}`} color={color}>
            {value}
          </Tag>
        ))}
      </div>
    </div>
  )
}

const AiDraftPreviewPane: React.FC<AiDraftPreviewPaneProps> = ({
  mode,
  status,
  draftPartial,
  finalDraft,
  summary,
  errorMessage,
  onApply,
  onDiscard
}) => {
  const previewDraft = finalDraft || draftPartial
  const isStreaming =
    status === 'connecting' ||
    status === 'thinking' ||
    status === 'answering' ||
    status === 'drafting'

  return (
    <div className="h-full flex flex-col overflow-hidden rounded-[22px] border border-custom-bg-200 bg-white shadow-sm">
      <div className="flex h-[40px] items-center justify-between border-b border-[#f0f0f0] bg-[#fafafa] pl-4">
        <div className="text-sm font-semibold text-[#167c72]">AI草稿预览</div>
        <div className="flex h-full items-end gap-[2px]">
          <div className="mt-[2px] flex items-center gap-2 mr-3 pb-[9px]">
            {isStreaming && (
              <Tag className="m-0" color="processing">
                生成中
              </Tag>
            )}
            {status === 'draft_ready' && (
              <Tag className="m-0" color="success">
                草稿就绪
              </Tag>
            )}
            {status === 'done' && finalDraft && (
              <Tag className="m-0" color="success">
                可应用
              </Tag>
            )}
          </div>
          <div
            onClick={!previewDraft && !errorMessage ? undefined : onDiscard}
            className={`flex h-[39px] items-center justify-center rounded-t-lg border border-[#f0f0f0] border-b-0 px-4 text-[14px] transition-colors ${
              !previewDraft && !errorMessage
                ? 'cursor-not-allowed bg-[#fafafa] text-gray-400'
                : 'cursor-pointer bg-[#fafafa] hover:bg-white hover:text-[#167c72]'
            }`}
          >
            放弃草稿
          </div>
          <div
            onClick={!finalDraft ? undefined : onApply}
            className={`mr-2 flex h-[39px] items-center justify-center rounded-t-lg border border-b-0 px-4 text-[14px] transition-all duration-300 ${
              !finalDraft
                ? 'cursor-not-allowed border-[#f0f0f0] bg-[#fafafa] text-gray-400'
                : 'cursor-pointer border-transparent bg-gradient-to-r from-teal-500 to-emerald-400 font-semibold text-white shadow-[0_-2px_10px_rgba(20,184,166,0.3)] hover:opacity-90'
            }`}
          >
            应用到编辑器
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-no-scrollbar px-4 py-4 bg-white">
        {errorMessage && (
          <Alert
            className="mb-4"
            type="error"
            showIcon
            message="AI 草稿生成失败"
            description={errorMessage}
          />
        )}

        {summary && (
          <div className="mb-4 rounded-2xl border border-custom-bg-200 bg-custom-bg-100/60 p-4 shadow-sm">
            <div className="mb-3 text-sm font-semibold text-custom-text-100">变更摘要</div>
            <div className="space-y-4">
              <SummaryTags label="新增" color="green" values={summary.added} />
              <SummaryTags label="更新" color="blue" values={summary.updated} />
              <SummaryTags label="删除" color="red" values={summary.deleted} />
            </div>
          </div>
        )}

        {previewDraft ? (
          <QuestionnairePreview
            title={previewDraft.title}
            description={previewDraft.description}
            footerText={previewDraft.footerText}
            components={previewDraft.components}
            emptyTitle="AI 尚未生成组件"
            emptyDescription="继续等待流式草稿"
          />
        ) : isStreaming ? (
          <div className="rounded-2xl border border-custom-bg-200 bg-white p-5 shadow-sm">
            <Skeleton active paragraph={{ rows: 8 }} />
          </div>
        ) : (
          <div className="h-full min-h-[420px] rounded-2xl border-2 border-dashed border-custom-bg-200 bg-white flex items-center justify-center">
            <Empty
              description={
                mode === 'generate'
                  ? '在左侧输入需求后，这里会实时显示 AI 生成的组件草稿'
                  : '在左侧输入修改指令后，这里会实时显示 AI 修改后的问卷草稿'
              }
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default AiDraftPreviewPane
