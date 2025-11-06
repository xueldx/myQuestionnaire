import React, { useEffect, useRef, useState } from 'react'
import { Alert, Button, Tag } from 'antd'
import { DownOutlined, RightOutlined } from '@ant-design/icons'
import {
  AiChatMessage,
  AiCopilotIntent,
  AiProcessMessageMeta,
  AiProcessStep,
  AiStreamStatus
} from './aiCopilotTypes'

interface AiMessageListProps {
  mode: AiCopilotIntent
  messages: AiChatMessage[]
  status: AiStreamStatus
  errorMessage: string | null
}

const AUTO_FOLLOW_THRESHOLD = 56

const normalizeProcessMeta = (message: AiChatMessage): AiProcessMessageMeta => {
  const metadata = (message.metadata || {}) as Partial<AiProcessMessageMeta>
  return {
    collapsed: Boolean(metadata.collapsed),
    summary: typeof metadata.summary === 'string' ? metadata.summary : '处理中',
    steps: Array.isArray(metadata.steps) ? (metadata.steps as AiProcessStep[]) : []
  }
}

const ProcessMessageCard = React.memo(({ message }: { message: AiChatMessage }) => {
  const meta = normalizeProcessMeta(message)
  const [expanded, setExpanded] = useState(!meta.collapsed)

  useEffect(() => {
    setExpanded(!meta.collapsed)
  }, [message.id, meta.collapsed])

  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] rounded-2xl rounded-tl-sm border border-[#CDEBE5] bg-[#F7FCFB] px-4 py-3 text-sm text-custom-text-100 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-[#0F766E]">
              本轮处理
            </div>
            <div className="mt-1 text-sm font-medium text-custom-text-100">{meta.summary}</div>
          </div>
          <Button
            type="text"
            size="small"
            className="!h-7 !w-7 !rounded-full"
            icon={expanded ? <DownOutlined /> : <RightOutlined />}
            onClick={() => setExpanded(previous => !previous)}
          />
        </div>

        {expanded && meta.steps.length > 0 ? (
          <div className="relative mt-4 space-y-3 pl-6">
            <div className="absolute left-[9px] top-1 bottom-1 w-px bg-[#CDEBE5]" />
            {meta.steps.map(step => {
              const dotClass =
                step.status === 'done'
                  ? 'bg-[#26A69A]'
                  : step.status === 'error'
                  ? 'bg-[#EF4444]'
                  : step.status === 'running'
                  ? 'bg-[#F59E0B]'
                  : 'bg-[#D1D5DB]'

              return (
                <div key={step.id} className="relative">
                  <div
                    className={`absolute left-[-22px] top-1.5 h-[10px] w-[10px] rounded-full border-2 border-white ${dotClass} ${
                      step.status === 'running' ? 'animate-pulse' : ''
                    }`}
                  />
                  <div className="text-sm font-medium text-custom-text-100">{step.label}</div>
                  <div className="mt-0.5 text-xs text-custom-text-200">
                    {step.status === 'done'
                      ? '已完成'
                      : step.status === 'error'
                      ? '处理异常'
                      : step.status === 'running'
                      ? '进行中'
                      : '等待中'}
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}
      </div>
    </div>
  )
})

ProcessMessageCard.displayName = 'ProcessMessageCard'

const MessageBubble = React.memo(({ message }: { message: AiChatMessage }) => {
  const isUser = message.role === 'user'
  const isProcess = message.role === 'process' || message.kind === 'process'
  const isTool = message.role === 'tool'

  if (isProcess) {
    return <ProcessMessageCard message={message} />
  }

  if (isTool) {
    return null
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
          isUser
            ? 'rounded-tr-sm bg-custom-primary-100 text-white'
            : 'rounded-tl-sm border border-white/50 bg-white/80 text-custom-text-100 backdrop-blur-md'
        }`}
      >
        <div className="whitespace-pre-wrap break-words">
          {message.content || (isUser ? '' : '正在思考中...')}
        </div>
      </div>
    </div>
  )
})

MessageBubble.displayName = 'MessageBubble'

const AiMessageList: React.FC<AiMessageListProps> = ({ mode, messages, status, errorMessage }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isAutoFollow, setIsAutoFollow] = useState(true)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !isAutoFollow) return

    container.scrollTop = container.scrollHeight
  }, [isAutoFollow, messages, status])

  const syncAutoFollow = () => {
    const container = containerRef.current
    if (!container) return

    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    setIsAutoFollow(distanceToBottom <= AUTO_FOLLOW_THRESHOLD)
  }

  const scrollToBottom = () => {
    const container = containerRef.current
    if (!container) return

    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth'
    })
    setIsAutoFollow(true)
  }

  return (
    <div className="relative h-full">
      <div
        ref={containerRef}
        className="h-full overflow-y-auto custom-no-scrollbar px-1"
        onScroll={syncAutoFollow}
        style={{ overflowAnchor: 'auto' }}
      >
        {errorMessage && (
          <Alert
            className="mb-3"
            type="error"
            showIcon
            message="AI 会话异常"
            description={errorMessage}
          />
        )}

        {messages.length === 0 ? (
          <div className="flex min-h-full items-end">
            <div className="max-w-[88%] rounded-2xl rounded-tl-sm border border-white/50 bg-white/80 px-4 py-3 text-sm leading-6 text-custom-text-100 shadow-sm backdrop-blur-md">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-custom-text-200">
                AI助手
                <Tag color="processing" bordered={false}>
                  {mode === 'generate' ? '生成模式' : '修改模式'}
                </Tag>
              </div>
              <div>
                {mode === 'generate'
                  ? '先输入你的需求。你可以先点“润色”优化 Prompt，也可以直接点“发送”开始生成问卷草稿。'
                  : '直接告诉我你想改哪一项，我会在中间预览里标出对应位置和修改建议。'}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-1">
            {messages.map((message, index) => (
              <MessageBubble
                key={String(message.id || `${message.role}-${index}`)}
                message={message}
              />
            ))}
          </div>
        )}
      </div>

      {!isAutoFollow && messages.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <Button
            type="default"
            size="small"
            className="pointer-events-auto rounded-full border-white/60 bg-white/85 shadow-md"
            onClick={scrollToBottom}
          >
            回到底部
          </Button>
        </div>
      )}
    </div>
  )
}

export default AiMessageList
