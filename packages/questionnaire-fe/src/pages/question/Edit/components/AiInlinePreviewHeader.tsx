import React from 'react'
import { Tag } from 'antd'
import { LeftOutlined } from '@ant-design/icons'
import { AiCopilotIntent } from './aiCopilotTypes'

interface AiInlinePreviewHeaderProps {
  mode: AiCopilotIntent
  isStreaming: boolean
  streamingLabel: string
  status: string
  allPatchChangesHandled: boolean
  hasAppliedPatchItems: boolean
  hasSelectedPatchItems: boolean
  selectedPatchIdsLength: number
  patchCount: number
  isCancelledPartialDraft: boolean
  draftApplied: boolean
  canApplyDraft: boolean
  applyButtonLabel: string
  previewDraftExists: boolean
  errorMessage: string | null
  onBack: () => void
  onDiscard: () => void
  onApply: () => void
  onSelectAllPatches: () => void
  onClearPatchSelection: () => void
}

const AiInlinePreviewHeader: React.FC<AiInlinePreviewHeaderProps> = ({
  mode,
  isStreaming,
  streamingLabel,
  status,
  allPatchChangesHandled,
  hasAppliedPatchItems,
  hasSelectedPatchItems,
  selectedPatchIdsLength,
  patchCount,
  isCancelledPartialDraft,
  draftApplied,
  canApplyDraft,
  applyButtonLabel,
  previewDraftExists,
  errorMessage,
  onBack,
  onDiscard,
  onApply,
  onSelectAllPatches,
  onClearPatchSelection
}) => {
  const showPatchSelectionActions = patchCount > 0 && !draftApplied && !allPatchChangesHandled
  const discardButtonLabel = mode === 'edit' || hasAppliedPatchItems ? '放弃本轮建议' : '放弃草稿'

  return (
    <div className="flex h-[40px] items-center justify-between rounded-t-[21px] border-b border-[#f0f0f0] bg-[#fafafa] pl-4">
      <div className="text-sm font-semibold text-[#167c72]">AI草稿预览</div>
      <div className="flex h-full items-end gap-[2px]">
        <div className="mt-[2px] mr-3 flex items-center gap-2 pb-[9px]">
          {isStreaming && (
            <Tag className="m-0" color="processing">
              {streamingLabel}
            </Tag>
          )}
          {status === 'draft_ready' && !allPatchChangesHandled && (
            <Tag className="m-0" color="success">
              草稿就绪
            </Tag>
          )}
          {allPatchChangesHandled && !draftApplied && (
            <Tag className="m-0" color="default">
              已处理
            </Tag>
          )}
          {patchCount > 0 && !draftApplied && hasSelectedPatchItems && (
            <Tag className="m-0" color="processing">
              {selectedPatchIdsLength}/{patchCount} 项已选
            </Tag>
          )}
          {showPatchSelectionActions && (
            <>
              <button
                type="button"
                onClick={onSelectAllPatches}
                className="text-xs text-custom-text-200 transition-colors hover:text-[#167c72]"
              >
                全选
              </button>
              <button
                type="button"
                onClick={onClearPatchSelection}
                className="text-xs text-custom-text-200 transition-colors hover:text-[#167c72]"
              >
                取消全选
              </button>
            </>
          )}
          {isCancelledPartialDraft && (
            <Tag className="m-0" color="warning">
              已保留已生成部分
            </Tag>
          )}
          {draftApplied && (
            <Tag className="m-0" color="success">
              已应用
            </Tag>
          )}
        </div>
        <div
          onClick={onBack}
          className="flex h-[39px] cursor-pointer items-center justify-center rounded-t-lg border border-[#f0f0f0] border-b-0 bg-[#fafafa] px-4 text-[14px] transition-colors hover:bg-white hover:text-[#167c72]"
        >
          <LeftOutlined className="mr-1" /> 返回编辑器预览
        </div>
        <div
          onClick={!previewDraftExists && !errorMessage ? undefined : onDiscard}
          className={`flex h-[39px] items-center justify-center rounded-t-lg border border-[#f0f0f0] border-b-0 px-4 text-[14px] transition-colors ${
            !previewDraftExists && !errorMessage
              ? 'cursor-not-allowed bg-[#fafafa] text-gray-400'
              : 'cursor-pointer bg-[#fafafa] hover:bg-white hover:text-[#167c72]'
          }`}
        >
          {discardButtonLabel}
        </div>
        <div
          onClick={!canApplyDraft ? undefined : onApply}
          className={`mr-2 flex h-[39px] items-center justify-center rounded-t-lg border border-b-0 px-4 text-[14px] transition-all duration-300 ${
            !canApplyDraft
              ? 'cursor-not-allowed border-[#f0f0f0] bg-[#fafafa] text-gray-400'
              : 'cursor-pointer border-transparent bg-gradient-to-r from-teal-500 to-emerald-400 font-semibold text-white shadow-[0_-2px_10px_rgba(20,184,166,0.3)] hover:opacity-90'
          }`}
        >
          {applyButtonLabel}
        </div>
      </div>
    </div>
  )
}

export default AiInlinePreviewHeader
