import React from 'react'
import { EditOutlined, PushpinOutlined } from '@ant-design/icons'
import { Tooltip } from 'antd'
import { ComponentInfoType } from '@/store/modules/componentsSlice'
import { AiCopilotIntent } from './aiCopilotTypes'

const CHINESE_CHAR_LIMIT = 14
const NON_CHINESE_CHAR_LIMIT = 35

const isChineseChar = (char: string) => /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/.test(char)

const truncateTitleText = (text: string): string => {
  let chineseCount = 0
  let nonChineseCount = 0
  let result = ''

  for (const char of text) {
    if (isChineseChar(char)) {
      if (chineseCount >= CHINESE_CHAR_LIMIT) {
        return `${result}...`
      }
      chineseCount += 1
    } else {
      if (nonChineseCount >= NON_CHINESE_CHAR_LIMIT) {
        return `${result}...`
      }
      nonChineseCount += 1
    }

    result += char
  }

  return result
}

const TruncatedTitle: React.FC<{
  text: string
  className?: string
}> = ({ text, className = '' }) => {
  if (!text) return null

  const displayText = truncateTitleText(text)

  return (
    <Tooltip title={text}>
      <span className={`inline-block max-w-[280px] align-bottom ${className}`}>{displayText}</span>
    </Tooltip>
  )
}

const MetaLine: React.FC<{
  items: string[]
  className?: string
}> = ({ items, className = 'text-custom-text-200' }) => (
  <ul className={`mt-2 space-y-1 text-xs ${className}`}>
    {items.map(item => (
      <li key={item} className="flex items-start gap-1.5 leading-5">
        <span className="mt-[0.55em] text-[10px] leading-none text-current">•</span>
        <span>{item}</span>
      </li>
    ))}
  </ul>
)

const GenerateHint: React.FC<{
  currentComponents: ComponentInfoType[]
  selectedId: string
  baseComponentCount?: number | null
  reviewCompleted?: boolean
}> = ({ currentComponents, selectedId, baseComponentCount, reviewCompleted = false }) => {
  const selectedIndex =
    selectedId == null
      ? -1
      : currentComponents.findIndex(component => component.fe_id === selectedId)
  const selectedComponent = selectedIndex >= 0 ? currentComponents[selectedIndex] : null

  const generateBaseCount = baseComponentCount ?? currentComponents.length
  const startedFromEmpty = generateBaseCount === 0
  const hasAcceptedGeneratedItems = startedFromEmpty && currentComponents.length > 0
  const showInitialCreateHint = startedFromEmpty && !hasAcceptedGeneratedItems
  const showDraftOrderHint = startedFromEmpty && hasAcceptedGeneratedItems && !reviewCompleted
  const showInsertPositionHint = !showInitialCreateHint && !showDraftOrderHint

  return (
    <div className="rounded-2xl border border-[#BFE7DE] bg-[linear-gradient(135deg,rgba(248,255,252,0.98),rgba(235,247,242,0.96))] px-4 py-3 shadow-sm backdrop-blur-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#DDF5EF] text-[#0F766E]">
          <PushpinOutlined />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-6 text-[#355E59]">
            <span className="font-semibold text-[#0F766E]">
              {showInsertPositionHint ? '插入位置' : '问卷状态'}
            </span>
            {showInitialCreateHint ? (
              <>
                <span>当前为</span>
                <span className="font-semibold text-[#0F766E]">新建问卷</span>
                <span>，AI 将从</span>
                <span className="font-semibold text-[#0F766E]">第 1 题</span>
                <span>开始生成内容</span>
              </>
            ) : showDraftOrderHint ? (
              <>
                <span>当前为</span>
                <span className="font-semibold text-[#0F766E]">从零创建问卷</span>
                <span>，建议按</span>
                <span className="font-semibold text-[#0F766E]">AI 草稿顺序</span>
                <span>逐项确认</span>
              </>
            ) : selectedComponent ? (
              <>
                <span>新增题目将插入到</span>
                <span className="font-semibold text-[#0F766E]">第 {selectedIndex + 1} 题之后</span>
                <span className="text-[#6F8F89]">（</span>
                <TruncatedTitle
                  text={selectedComponent.title || '未命名题目'}
                  className="max-w-[320px] text-[#6F8F89]"
                />
                <span className="text-[#6F8F89]">）</span>
              </>
            ) : (
              <>
                <span>新增题目将插入到</span>
                <span className="font-semibold text-[#0F766E]">当前问卷末尾</span>
              </>
            )}
          </div>

          <MetaLine
            className="text-[#6B8C86]"
            items={
              showInitialCreateHint
                ? [
                    'AI生成后可逐题审核，也可通过顶部工具栏批量操作',
                    '如顺序不合适，可返回编辑器拖拽调整顺序'
                  ]
                : showDraftOrderHint
                ? [
                    'AI生成后可逐题审核，也可通过顶部工具栏批量操作',
                    '如顺序不合适，可返回主编辑器拖拽调整顺序'
                  ]
                : [
                    startedFromEmpty
                      ? '当前问卷已创建完成，可继续在此基础上新增'
                      : '基于已有问卷生成',
                    '可选中相关问题切换插入位置',
                    '如修改位置不合适，可返回主编辑器拖拽调整顺序'
                  ]
            }
          />
        </div>
      </div>
    </div>
  )
}

const EditHint: React.FC<{
  currentComponents: ComponentInfoType[]
  selectedId: string
}> = ({ currentComponents, selectedId }) => {
  const selectedIndex =
    selectedId == null
      ? -1
      : currentComponents.findIndex(component => component.fe_id === selectedId)
  const selectedComponent = selectedIndex >= 0 ? currentComponents[selectedIndex] : null

  return (
    <div className="rounded-2xl border border-[#F6D79B] bg-[linear-gradient(135deg,rgba(255,251,239,0.98),rgba(255,246,222,0.96))] px-4 py-3 shadow-sm backdrop-blur-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FDE7C7] text-[#9A6700]">
          <EditOutlined />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-6 text-[#7A5A22]">
            <span className="font-semibold text-[#9A6700]">修改目标</span>
            {selectedComponent ? (
              <>
                <span>当前将修改</span>
                <span className="font-semibold text-[#9A6700]">第 {selectedIndex + 1} 题</span>
                <span className="text-[#B4874F]">（</span>
                <TruncatedTitle
                  text={selectedComponent.title || '未命名题目'}
                  className="max-w-[320px] text-[#B4874F]"
                />
                <span className="text-[#B4874F]">）</span>
              </>
            ) : (
              <>
                <span>当前未选中题目，暂时无法发起</span>
                <span className="font-semibold text-[#9A6700]">单题修改</span>
              </>
            )}
          </div>
          <MetaLine
            className="text-[#A07A45]"
            items={
              selectedComponent
                ? ['仅修改当前选中题目', '如选错题目，重新选择后再发送']
                : ['请先选中要修改的题目', '如选错题目，重新选择即可']
            }
          />
        </div>
      </div>
    </div>
  )
}

export const AiDraftContextHint: React.FC<{
  mode: AiCopilotIntent
  currentComponents: ComponentInfoType[]
  selectedId: string
  generateBaseComponentCount?: number | null
  generateReviewCompleted?: boolean
}> = ({
  mode,
  currentComponents,
  selectedId,
  generateBaseComponentCount,
  generateReviewCompleted
}) => {
  return mode === 'generate' ? (
    <GenerateHint
      currentComponents={currentComponents}
      selectedId={selectedId}
      baseComponentCount={generateBaseComponentCount}
      reviewCompleted={generateReviewCompleted}
    />
  ) : (
    <EditHint currentComponents={currentComponents} selectedId={selectedId} />
  )
}
