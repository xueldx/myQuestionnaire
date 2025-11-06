import React from 'react'
import { Button, Empty, Input, Modal, Tag, Tooltip } from 'antd'
import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  HistoryOutlined,
  PlusOutlined,
  PushpinOutlined
} from '@ant-design/icons'
import AiComposer from './AiComposer'
import AiMessageList from './AiMessageList'
import {
  AiConversationSummary,
  AiCopilotIntent,
  AiChatMessage,
  AiModelOption,
  AiStreamStatus
} from './aiCopilotTypes'

interface AiCopilotPanelProps {
  mode: AiCopilotIntent
  status: AiStreamStatus
  messages: AiChatMessage[]
  conversationList: AiConversationSummary[]
  activeConversationId: number | null
  conversationLoading: boolean
  conversationListLoading: boolean
  modelList: AiModelOption[]
  selectedModel: string
  composerInput: string
  errorMessage: string | null
  hasGenerateBase: boolean
  onModeChange: (mode: AiCopilotIntent) => void
  onModelChange: (model: string) => void
  onComposerInputChange: (value: string) => void
  onCreateConversation: () => Promise<unknown> | unknown
  onSelectConversation: (conversationId: number) => Promise<unknown> | unknown
  onRenameConversation: (conversationId: number, title: string) => Promise<boolean> | boolean
  onToggleConversationPin: (conversationId: number) => Promise<boolean> | boolean
  onDeleteConversation: (conversationId: number) => Promise<unknown> | unknown
  onSend: (instruction: string) => void
  onPolish: (instruction?: string) => void
  onCancel: () => void
}

const AiCopilotPanel: React.FC<AiCopilotPanelProps> = ({
  mode,
  status,
  messages,
  conversationList,
  activeConversationId,
  conversationLoading,
  conversationListLoading,
  modelList,
  selectedModel,
  composerInput,
  errorMessage,
  hasGenerateBase,
  onModeChange,
  onModelChange,
  onComposerInputChange,
  onCreateConversation,
  onSelectConversation,
  onRenameConversation,
  onToggleConversationPin,
  onDeleteConversation,
  onSend,
  onPolish,
  onCancel
}) => {
  const [isComposerExpanded, setIsComposerExpanded] = React.useState(false)
  const [isHistoryModalOpen, setIsHistoryModalOpen] = React.useState(false)
  const [renameTarget, setRenameTarget] = React.useState<AiConversationSummary | null>(null)
  const [renameValue, setRenameValue] = React.useState('')
  const [renameSubmitting, setRenameSubmitting] = React.useState(false)
  const [switchingConversationId, setSwitchingConversationId] = React.useState<number | null>(null)
  const [actionConversationId, setActionConversationId] = React.useState<number | null>(null)
  const isStreaming =
    status === 'connecting' ||
    status === 'polishing' ||
    status === 'thinking' ||
    status === 'answering' ||
    status === 'drafting'

  const statusInfo = (() => {
    if (mode === 'generate') {
      if (status === 'polishing') {
        return {
          type: 'success' as const,
          message: '正在润色需求',
          tooltip: '润色结果会直接回填到下方输入框，完成后你可以继续编辑，或者直接发送生成问卷。'
        }
      }

      if (status === 'awaiting_confirmation') {
        return {
          type: 'warning' as const,
          message: '润色完成，可继续编辑或发送',
          tooltip: '当前输入框里的内容就是接下来用于生成问卷的 Prompt。'
        }
      }

      if (status === 'connecting') {
        return {
          type: 'success' as const,
          message: '正在连接 AI',
          tooltip: '请求已发出，AI 会基于当前 Prompt 开始理解需求并生成问卷草稿。'
        }
      }

      if (status === 'thinking') {
        return {
          type: 'success' as const,
          message: '正在理解需求',
          tooltip: 'AI 正在分析当前 Prompt，并规划问卷的整体结构。'
        }
      }

      if (status === 'answering') {
        return {
          type: 'success' as const,
          message: '正在整理生成说明',
          tooltip: 'AI 正在整理本轮生成说明，随后会输出可应用的问卷草稿。'
        }
      }

      if (status === 'drafting') {
        return {
          type: 'success' as const,
          message: '正在生成问卷草稿',
          tooltip: 'AI 会根据当前输入框里的 Prompt 生成问卷草稿，中间区域会持续刷新预览。'
        }
      }

      if (status === 'draft_ready' || status === 'done') {
        return {
          type: 'success' as const,
          message: '问卷草稿已生成',
          tooltip: '可在中间预览查看，不满意可继续编辑后重新润色或发送。'
        }
      }
    }

    if (status === 'connecting') {
      return {
        type: 'success' as const,
        message: '正在连接 AI',
        tooltip: '请求已发出，AI 会先读取当前问卷，再生成修改建议。'
      }
    }

    if (status === 'thinking') {
      return {
        type: 'success' as const,
        message: '正在分析当前问卷',
        tooltip: 'AI 正在理解当前问卷结构，并规划本轮修改建议。'
      }
    }

    if (status === 'answering') {
      return {
        type: 'success' as const,
        message: '正在整理修改说明',
        tooltip: 'AI 正在生成本轮修改说明，随后会输出结构化草稿建议。'
      }
    }

    if (status === 'drafting') {
      return {
        type: 'success' as const,
        message: '正在生成修改建议',
        tooltip: '请查看中间预览，修改建议会持续标到原问卷对应位置。'
      }
    }

    if (status === 'draft_ready' || status === 'done') {
      return {
        type: 'success' as const,
        message: '修改草稿已生成',
        tooltip: '可在中间预览查看差异，确认后再应用到编辑器。'
      }
    }

    if (status === 'cancelled') {
      return {
        type: 'warning' as const,
        message: '会话已停止',
        tooltip:
          mode === 'generate'
            ? '输入框里会保留当前内容，你可以继续编辑后再次点"润色"或"发送"。'
            : '请补充更明确的修改意图后重新发送。'
      }
    }

    return null
  })()

  const placeholder =
    mode === 'generate'
      ? hasGenerateBase
        ? '请输入想追加的题目需求，例如：在最后一道题后补两道开放建议题'
        : '请输入原始需求，例如：想做一份门店服务满意度问卷，最好有基础信息、服务体验和建议题'
      : '请输入你的修改需求，例如：把第 3 题改成多选'

  const activeConversation = conversationList.find(item => item.id === activeConversationId)
  const formatConversationTime = (value: string | null) => {
    if (!value) return '暂无记录'

    return new Date(value).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusIcon = (type: string) => {
    if (type === 'success') return <CheckCircleOutlined />
    if (type === 'warning') return <ExclamationCircleOutlined />
    if (type === 'error') return <ExclamationCircleOutlined />
    return null
  }

  const handleOpenConversation = async (conversationId: number) => {
    if (conversationId === activeConversationId) {
      setIsHistoryModalOpen(false)
      return
    }

    setSwitchingConversationId(conversationId)
    try {
      await onSelectConversation(conversationId)
      setIsHistoryModalOpen(false)
    } finally {
      setSwitchingConversationId(null)
    }
  }

  const handleRenameSubmit = async () => {
    if (!renameTarget) return

    setRenameSubmitting(true)
    try {
      const success = await onRenameConversation(renameTarget.id, renameValue)
      if (!success) return
      setRenameTarget(null)
      setRenameValue('')
    } finally {
      setRenameSubmitting(false)
    }
  }

  const handleConversationAction = async (
    conversationId: number,
    action: () => Promise<unknown> | unknown
  ) => {
    setActionConversationId(conversationId)
    try {
      await action()
    } finally {
      setActionConversationId(currentId => (currentId === conversationId ? null : currentId))
    }
  }

  const handleSend = (instruction: string) => {
    if (isComposerExpanded) {
      setIsComposerExpanded(false)
    }

    onSend(instruction)
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-white/30">
      <Modal
        title="会话历史记录"
        open={isHistoryModalOpen}
        onCancel={() => setIsHistoryModalOpen(false)}
        footer={null}
        width={620}
      >
        <div className="max-h-[480px] overflow-y-auto pr-1">
          {conversationList.length === 0 ? (
            <Empty description="暂无会话记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <div className="space-y-3">
              {conversationList.map(item => {
                const isActive = item.id === activeConversationId
                const isOperating = actionConversationId === item.id
                const isSwitching = switchingConversationId === item.id

                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    className={`w-full cursor-pointer rounded-2xl border px-4 py-3 text-left transition ${
                      isActive
                        ? 'border-custom-primary-200 bg-custom-primary-200/10'
                        : 'border-[#E5F1EE] bg-white hover:border-custom-primary-200/50 hover:bg-[#F7FCFB]'
                    }`}
                    onClick={() => void handleOpenConversation(item.id)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        void handleOpenConversation(item.id)
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {item.isPinned ? (
                            <Tag color="gold" bordered={false}>
                              置顶
                            </Tag>
                          ) : null}
                          <Tag color="processing" bordered={false}>
                            {item.intent === 'generate' ? '生成' : '修改'}
                          </Tag>
                          {isActive ? (
                            <Tag color="success" bordered={false}>
                              当前会话
                            </Tag>
                          ) : null}
                        </div>
                        <div className="mt-2 truncate text-sm font-semibold text-custom-text-100">
                          {item.title}
                        </div>
                        <div className="mt-1 text-xs text-custom-text-200">
                          {item.messageCount} 条消息 ·{' '}
                          {formatConversationTime(item.latestActivityAt)}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <Tooltip title="重命名">
                          <Button
                            type="text"
                            size="small"
                            icon={<EditOutlined />}
                            disabled={isStreaming || isSwitching}
                            onClick={event => {
                              event.stopPropagation()
                              setRenameTarget(item)
                              setRenameValue(item.title)
                            }}
                          />
                        </Tooltip>
                        <Tooltip title={item.isPinned ? '取消置顶' : '置顶'}>
                          <Button
                            type="text"
                            size="small"
                            icon={<PushpinOutlined />}
                            loading={isOperating}
                            disabled={isStreaming || isSwitching}
                            onClick={event => {
                              event.stopPropagation()
                              void handleConversationAction(item.id, () =>
                                onToggleConversationPin(item.id)
                              )
                            }}
                          />
                        </Tooltip>
                        <Tooltip title="删除">
                          <Button
                            type="text"
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            loading={isOperating}
                            disabled={isStreaming || isSwitching}
                            onClick={event => {
                              event.stopPropagation()
                              void handleConversationAction(item.id, () =>
                                onDeleteConversation(item.id)
                              )
                            }}
                          />
                        </Tooltip>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        title="重命名会话"
        open={!!renameTarget}
        onCancel={() => {
          if (renameSubmitting) return
          setRenameTarget(null)
          setRenameValue('')
        }}
        onOk={() => void handleRenameSubmit()}
        confirmLoading={renameSubmitting}
        okText="保存"
        cancelText="取消"
      >
        <Input
          value={renameValue}
          maxLength={120}
          autoFocus
          placeholder="请输入会话标题"
          onChange={event => setRenameValue(event.target.value)}
          onPressEnter={() => void handleRenameSubmit()}
        />
      </Modal>

      <div className="flex min-h-0 flex-1 flex-col p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-custom-text-100">
              {activeConversation?.title || 'AI 会话'}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-custom-text-200">
              {activeConversation ? (
                <>
                  <Tag color="processing" bordered={false}>
                    {activeConversation.intent === 'generate' ? '生成会话' : '修改会话'}
                  </Tag>
                  <span>{activeConversation.messageCount} 条消息</span>
                </>
              ) : (
                <span>当前问卷的 AI 会话</span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Tooltip title="新建会话">
              <Button
                shape="circle"
                icon={<PlusOutlined />}
                disabled={conversationLoading || isStreaming}
                onClick={() => void onCreateConversation()}
              />
            </Tooltip>
            <Tooltip title="历史记录">
              <Button
                shape="circle"
                icon={<HistoryOutlined />}
                loading={conversationListLoading}
                disabled={conversationLoading}
                onClick={() => setIsHistoryModalOpen(true)}
              />
            </Tooltip>
          </div>
        </div>

        {statusInfo ? (
          <Tooltip title={statusInfo.tooltip} placement="top">
            <div
              className={`mb-2 inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium leading-4 ${
                statusInfo.type === 'warning'
                  ? 'border border-orange-200/50 bg-orange-50/60 text-orange-700'
                  : 'border border-[#92D7CB] bg-[#DDF5EF] text-[#0F766E]'
              }`}
            >
              <span className="text-sm">{getStatusIcon(statusInfo.type)}</span>
              <span>{statusInfo.message}</span>
            </div>
          </Tooltip>
        ) : null}

        <div className="min-h-0 flex-1">
          <AiMessageList
            mode={mode}
            messages={messages}
            status={status}
            errorMessage={errorMessage}
          />
        </div>
      </div>

      {!isComposerExpanded && (
        <div className="flex min-h-[200px] shrink-0 flex-col p-4 pt-0">
          <AiComposer
            value={composerInput}
            isStreaming={isStreaming}
            placeholder={placeholder}
            mode={mode}
            modeLabels={{
              generate: hasGenerateBase ? '追加题目' : '新生成',
              edit: mode === 'edit' ? '继续修改' : '修改'
            }}
            modelList={modelList}
            selectedModel={selectedModel}
            onChange={onComposerInputChange}
            onModelChange={onModelChange}
            onModeChange={onModeChange}
            onSubmit={handleSend}
            onPolish={mode === 'generate' ? onPolish : undefined}
            onCancel={onCancel}
            isExpanded={false}
            onToggleExpanded={() => setIsComposerExpanded(true)}
          />
        </div>
      )}

      {isComposerExpanded && (
        <>
          <div
            className="absolute inset-0 z-20 bg-white/45 backdrop-blur-[2px]"
            onClick={() => setIsComposerExpanded(false)}
          />
          <div className="absolute inset-4 z-30 flex min-h-0 flex-col">
            <AiComposer
              value={composerInput}
              isStreaming={isStreaming}
              placeholder={placeholder}
              mode={mode}
              modeLabels={{
                generate: hasGenerateBase ? '追加题目' : '新生成',
                edit: mode === 'edit' ? '继续修改' : '修改'
              }}
              modelList={modelList}
              selectedModel={selectedModel}
              onChange={onComposerInputChange}
              onModelChange={onModelChange}
              onModeChange={onModeChange}
              onSubmit={handleSend}
              onPolish={mode === 'generate' ? onPolish : undefined}
              onCancel={onCancel}
              isExpanded
              onToggleExpanded={() => setIsComposerExpanded(false)}
            />
          </div>
        </>
      )}
    </div>
  )
}

export default AiCopilotPanel
