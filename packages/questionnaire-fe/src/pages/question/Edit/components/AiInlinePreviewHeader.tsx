import React from 'react'
import { Button, Dropdown, type MenuProps } from 'antd'
import { DownOutlined, LeftOutlined } from '@ant-design/icons'
import { AiCopilotIntent } from './aiCopilotTypes'

interface AiInlinePreviewHeaderProps {
  mode: AiCopilotIntent
  hasExistingQuestionnaireContent: boolean
  allPatchChangesHandled: boolean
  hasAppliedPatchItems: boolean
  selectedPatchIdsLength: number
  patchCount: number
  draftApplied: boolean
  canApplyDraft: boolean
  applyButtonLabel: string
  previewDraftExists: boolean
  errorMessage: string | null
  actionsDisabled: boolean
  onBack: () => void
  onDiscard: () => void
  onApply: () => void
  onSelectAllPatches: () => void
  onClearPatchSelection: () => void
}

const AiInlinePreviewHeader: React.FC<AiInlinePreviewHeaderProps> = ({
  mode,
  hasExistingQuestionnaireContent,
  allPatchChangesHandled,
  hasAppliedPatchItems,
  selectedPatchIdsLength,
  patchCount,
  draftApplied,
  canApplyDraft,
  applyButtonLabel,
  previewDraftExists,
  errorMessage,
  actionsDisabled,
  onBack,
  onDiscard,
  onApply,
  onSelectAllPatches,
  onClearPatchSelection
}) => {
  const previewTitle =
    mode === 'edit' ? 'AI修改预览' : hasExistingQuestionnaireContent ? 'AI新增预览' : 'AI问卷草稿'
  const showBatchAction = patchCount > 1 && !draftApplied && !allPatchChangesHandled
  const discardButtonLabel =
    mode === 'generate' && !hasExistingQuestionnaireContent && !hasAppliedPatchItems
      ? '放弃草稿'
      : '放弃剩余建议'
  const canDiscardDraft =
    Boolean(previewDraftExists || errorMessage) && !allPatchChangesHandled && !draftApplied
  const batchActionItems: MenuProps['items'] = [
    {
      key: 'select-all',
      label: '全选全部建议',
      disabled: actionsDisabled || selectedPatchIdsLength === patchCount
    },
    {
      key: 'clear-all',
      label: '取消全选',
      disabled: actionsDisabled || selectedPatchIdsLength === 0
    }
  ]

  const handleBatchActionClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'select-all') {
      onSelectAllPatches()
      return
    }

    onClearPatchSelection()
  }

  const secondaryButtonClass =
    'flex h-[39px] items-center justify-center rounded-t-lg border border-[#f0f0f0] border-b-0 bg-[#fafafa] px-4 text-[14px] transition-colors hover:bg-white hover:text-[#167c72]'
  const disabledSecondaryButtonClass =
    'flex h-[39px] items-center justify-center rounded-t-lg border border-[#f0f0f0] border-b-0 bg-[#fafafa] px-4 text-[14px] text-gray-400 cursor-not-allowed'
  const primaryButtonClass =
    'mr-2 flex h-[39px] items-center justify-center rounded-t-lg border border-transparent border-b-0 bg-gradient-to-r from-teal-500 to-emerald-400 px-4 text-[14px] font-semibold text-white shadow-[0_-2px_10px_rgba(20,184,166,0.3)] transition-all duration-300 hover:opacity-90'
  const disabledPrimaryButtonClass =
    'mr-2 flex h-[39px] items-center justify-center rounded-t-lg border border-[#f0f0f0] border-b-0 bg-[#fafafa] px-4 text-[14px] text-gray-400 cursor-not-allowed'

  return (
    <div className="flex h-[48px] items-center justify-between rounded-t-[21px] border-b border-[#f0f0f0] bg-[#fafafa] pl-4">
      <div className="text-sm font-semibold text-[#167c72]">{previewTitle}</div>
      <div className="flex h-full items-end gap-[2px]">
        {showBatchAction && (
          <div className="pb-[1px]">
            <Dropdown
              menu={{ items: batchActionItems, onClick: handleBatchActionClick }}
              trigger={actionsDisabled ? [] : ['click']}
            >
              <Button
                type="text"
                disabled={actionsDisabled}
                className="!h-[39px] rounded-t-lg !px-4 !text-[14px] !text-custom-text-200 hover:!text-[#167c72]"
              >
                批量操作 <DownOutlined className="text-xs" />
              </Button>
            </Dropdown>
          </div>
        )}
        <button type="button" onClick={onBack} className={secondaryButtonClass}>
          <LeftOutlined className="mr-1" /> 返回编辑器
        </button>
        <button
          type="button"
          onClick={canDiscardDraft && !actionsDisabled ? onDiscard : undefined}
          className={
            canDiscardDraft && !actionsDisabled
              ? secondaryButtonClass
              : disabledSecondaryButtonClass
          }
        >
          {discardButtonLabel}
        </button>
        <button
          type="button"
          onClick={canApplyDraft && !actionsDisabled ? onApply : undefined}
          className={
            canApplyDraft && !actionsDisabled ? primaryButtonClass : disabledPrimaryButtonClass
          }
        >
          {applyButtonLabel}
        </button>
      </div>
    </div>
  )
}

export default AiInlinePreviewHeader
