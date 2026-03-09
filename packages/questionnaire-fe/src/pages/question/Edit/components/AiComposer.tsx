/**
 * AI 指令输入框。
 * 这个文件属于左侧 AI 面板的输入 UI，只负责文本输入、模型/模式切换和发送/润色动作的交互呈现。
 * 为了保证输入跟手，这里只消费面板层传入的本地输入值，不再要求每个按键都同步驱动整页重渲染。
 */
import React from 'react'
import { Button, Input, Select, Tooltip } from 'antd'
import {
  FullscreenExitOutlined,
  FullscreenOutlined,
  HighlightOutlined,
  SendOutlined,
  StopOutlined
} from '@ant-design/icons'
import { AiCopilotIntent, AiModelOption } from './aiCopilotTypes'

const { TextArea } = Input

interface AiComposerProps {
  value: string
  isStreaming: boolean
  placeholder: string
  mode: AiCopilotIntent
  modeLabels: Record<AiCopilotIntent, string>
  modelList: AiModelOption[]
  selectedModel: string
  onChange: (value: string) => void
  onModelChange: (value: string) => void
  onModeChange: (mode: AiCopilotIntent) => void
  onSubmit: (value: string) => Promise<boolean | void> | boolean | void
  onPolish?: (value: string) => Promise<boolean | void> | boolean | void
  onCancel: () => void
  isExpanded?: boolean
  onToggleExpanded?: () => void
  onFocus?: () => void
  onBlur?: () => void
  onCompositionStart?: () => void
  onCompositionEnd?: (value: string) => void
}

const AiComposer: React.FC<AiComposerProps> = ({
  value,
  isStreaming,
  placeholder,
  mode,
  modeLabels,
  modelList,
  selectedModel,
  onChange,
  onModelChange,
  onModeChange,
  onSubmit,
  onPolish,
  onCancel,
  isExpanded = false,
  onToggleExpanded,
  onFocus,
  onBlur,
  onCompositionStart,
  onCompositionEnd
}) => {
  const handleSubmit = async () => {
    const trimmed = value.trim()
    if (!trimmed) return
    const shouldClear = (await onSubmit(trimmed)) !== false
    if (!shouldClear) return
    onChange('')
  }

  const handlePolish = async () => {
    const trimmed = value.trim()
    if (!trimmed || !onPolish) return
    const previousValue = value
    onChange('')
    const shouldClear = (await onPolish(trimmed)) !== false
    if (!shouldClear) {
      onChange(previousValue)
    }
  }

  return (
    <>
      <style>{`
        .ai-composer-textarea,
        .ai-composer-textarea textarea {
          resize: none !important;
          scrollbar-width: thin;
          scrollbar-color: rgba(180, 180, 180, 0.4) transparent;
          border: none !important;
          box-shadow: none !important;
          background: transparent !important;
        }
        .ai-composer-textarea::-webkit-scrollbar,
        .ai-composer-textarea textarea::-webkit-scrollbar {
          width: 6px;
        }
        .ai-composer-textarea::-webkit-scrollbar-button,
        .ai-composer-textarea textarea::-webkit-scrollbar-button {
          display: none !important;
          height: 0 !important;
          width: 0 !important;
        }
        .ai-composer-textarea::-webkit-scrollbar-track,
        .ai-composer-textarea textarea::-webkit-scrollbar-track {
          background: transparent;
        }
        .ai-composer-textarea::-webkit-scrollbar-thumb,
        .ai-composer-textarea textarea::-webkit-scrollbar-thumb {
          background: rgba(180, 180, 180, 0.4);
          border-radius: 3px;
        }
        .ai-composer-textarea::-webkit-scrollbar-thumb:hover,
        .ai-composer-textarea textarea::-webkit-scrollbar-thumb:hover {
          background: rgba(150, 150, 150, 0.6);
        }
        .ai-composer-textarea::-webkit-resizer,
        .ai-composer-textarea textarea::-webkit-resizer {
          display: none !important;
        }
        /* 兼容 Firefox 隐藏 resize 标识 */
        .ai-composer-textarea,
        .ai-composer-textarea textarea {
          overflow: auto;
        }
        /* 兼容 Edge/IE 隐藏滚动条按钮 */
        .ai-composer-textarea::-ms-scrollbar-button,
        .ai-composer-textarea textarea::-ms-scrollbar-button {
          display: none !important;
          height: 0 !important;
          width: 0 !important;
        }
        
        .ai-composer-select .ant-select-selector {
          padding: 0 !important;
        }

        .ai-composer-mode-select .ant-select-arrow {
          right: 2px !important;
        }

        .ai-composer-mode-select .ant-select-selection-item {
          padding-right: 16px !important;
        }
      `}</style>
      <div
        className={`relative flex h-full flex-col rounded-[22px] border transition-all duration-300 ${
          isExpanded
            ? 'border-custom-primary-200/40 bg-white shadow-2xl'
            : 'border-black/10 bg-white/65 shadow-sm hover:border-black/20 focus-within:border-custom-primary-200/50'
        }`}
      >
        {/* Input Area */}
        <div className="relative min-h-0 flex-1 p-3 pb-0">
          <TextArea
            className="ai-composer-textarea w-full"
            value={value}
            onChange={event => onChange(event.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
            onCompositionStart={onCompositionStart}
            onCompositionEnd={event => onCompositionEnd?.(event.currentTarget.value)}
            placeholder={placeholder}
            autoSize={false}
            style={{
              height: '100%',
              paddingRight: onToggleExpanded ? 32 : 0
            }}
            onPressEnter={event => {
              if ((event.shiftKey || event.ctrlKey) && !isStreaming) {
                event.preventDefault()
                void handleSubmit()
              }
            }}
          />
          {onToggleExpanded && (
            <Tooltip title={isExpanded ? '收起' : '放大'} placement="top">
              <Button
                type="text"
                size="small"
                onClick={onToggleExpanded}
                className="absolute right-3 top-3 !h-7 !w-7 !p-0 text-custom-text-200 hover:!bg-custom-primary-200/10 hover:!text-custom-primary-200"
                icon={isExpanded ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              />
            </Tooltip>
          )}
        </div>

        {/* Toolbar Area */}
        <div className="flex items-center justify-between px-3 pb-3 pt-2">
          <div className="flex flex-1 items-center gap-2 overflow-hidden">
            {/* Model Select */}
            <Select
              variant="borderless"
              size="small"
              value={selectedModel || undefined}
              onChange={onModelChange}
              placeholder="模型"
              disabled={isStreaming}
              popupMatchSelectWidth={false}
              dropdownRender={menu => (
                <div>
                  <div className="px-3 py-2 text-sm text-custom-text-200/50">选择模型</div>
                  <div className="h-[1px] bg-black/5 mx-2 mb-1" />
                  {menu}
                </div>
              )}
              options={modelList.map(item => ({
                value: item.value,
                label: <span className="text-sm font-normal">{item.label}</span>
              }))}
              className="ai-composer-select min-w-[70px] [&_.ant-select-selection-item]:!text-sm [&_.ant-select-selection-item]:!leading-6 [&_.ant-select-selection-item]:!pr-6"
            />

            {/* Mode Select */}
            <Select
              variant="borderless"
              size="small"
              value={mode}
              onChange={value => onModeChange(value)}
              disabled={isStreaming}
              popupMatchSelectWidth={false}
              dropdownRender={menu => (
                <div>
                  <div className="px-3 py-2 text-sm text-custom-text-200/50">操作方式</div>
                  <div className="h-[1px] bg-black/5 mx-2 mb-1" />
                  {menu}
                </div>
              )}
              options={[
                {
                  value: 'generate',
                  label: <span className="text-sm font-normal">{modeLabels.generate}</span>
                },
                {
                  value: 'edit',
                  label: <span className="text-sm font-normal">{modeLabels.edit}</span>
                }
              ]}
              className="ai-composer-select ai-composer-mode-select min-w-0 w-auto [&_.ant-select-selection-item]:!text-sm [&_.ant-select-selection-item]:!leading-6"
            />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {/* Polish Button */}
            {onPolish && (
              <Tooltip title="润色需求" placement="top">
                <Button
                  type="text"
                  onClick={handlePolish}
                  disabled={isStreaming || !value.trim()}
                  icon={<HighlightOutlined className="text-base" />}
                  className="!h-8 !w-8 rounded-full text-custom-text-200 hover:!bg-custom-primary-200/10 hover:!text-custom-primary-200 disabled:!bg-transparent flex items-center justify-center font-normal"
                />
              </Tooltip>
            )}

            {/* Send / Stop Button */}
            <Tooltip title={isStreaming ? '停止生成' : '发送指令'} placement="top">
              <Button
                type="primary"
                size="small"
                shape="circle"
                onClick={isStreaming ? onCancel : () => void handleSubmit()}
                disabled={!isStreaming && !value.trim()}
                icon={isStreaming ? <StopOutlined /> : <SendOutlined className="!ml-[2px]" />}
                className="!h-8 !w-8 flex items-center justify-center border-transparent bg-custom-primary-200 text-white shadow-sm shadow-custom-primary-200/20 hover:!bg-custom-primary-100 disabled:!bg-gray-100 disabled:!text-gray-400"
              />
            </Tooltip>
          </div>
        </div>
      </div>
    </>
  )
}

export default React.memo(AiComposer)
