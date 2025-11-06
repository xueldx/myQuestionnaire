import React from 'react'
import { Alert, Button, Empty, Tag } from 'antd'
import { LeftOutlined } from '@ant-design/icons'
import ComponentRender from '@/pages/question/Edit/components/ComponentRender'
import { ComponentInfoType } from '@/store/modules/componentsSlice'
import { AiCopilotIntent, AiStreamStatus, DraftSummary, QuestionnaireDraft } from './aiCopilotTypes'
import { generateDraftContainsCurrentComponents } from '@/pages/question/Edit/hooks/aiGenerateDraftMerge'

interface AiInlineQuestionnairePreviewProps {
  mode: AiCopilotIntent
  status: AiStreamStatus
  currentQuestionnaire: QuestionnaireDraft
  draftPartial: QuestionnaireDraft | null
  finalDraft: QuestionnaireDraft | null
  summary: DraftSummary | null
  errorMessage: string | null
  warningMessage: string | null
  draftApplied: boolean
  selectedId: string
  onApply: () => void
  onDiscard: () => void
  onBack: () => void
}

type AnnotationTone = 'current' | 'suggestion' | 'danger' | 'info' | 'anchor'

const stringifyValue = (value: unknown) => JSON.stringify(value ?? null)

const hasComponentChanged = (current: ComponentInfoType, next: ComponentInfoType) => {
  return (
    current.type !== next.type ||
    current.title !== next.title ||
    stringifyValue(current.props) !== stringifyValue(next.props)
  )
}

const buildAddedInsertMap = (
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

interface PreviewCardProps {
  label: string
  note?: string
  tone?: AnnotationTone
  component: ComponentInfoType
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

const PreviewCard: React.FC<PreviewCardProps> = ({ label, note, tone = 'current', component }) => {
  return (
    <div className={`rounded-3xl border px-4 py-4 shadow-sm ${toneClassNameMap[tone]}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tagClassNameMap[tone]}`}
        >
          {label}
        </span>
        {note && <span className="text-xs text-custom-text-200">{note}</span>}
      </div>
      <div className="pointer-events-none select-none">
        <ComponentRender component={component} />
      </div>
    </div>
  )
}

const PageConfigSuggestion: React.FC<{
  currentQuestionnaire: QuestionnaireDraft
  previewQuestionnaire: QuestionnaireDraft
}> = ({ currentQuestionnaire, previewQuestionnaire }) => {
  const titleChanged = currentQuestionnaire.title !== previewQuestionnaire.title
  const descriptionChanged = currentQuestionnaire.description !== previewQuestionnaire.description
  const footerChanged = currentQuestionnaire.footerText !== previewQuestionnaire.footerText

  if (!titleChanged && !descriptionChanged && !footerChanged) return null

  return (
    <div className="mb-4 rounded-3xl border border-[#CFE2FF] bg-[#F7FAFF] px-4 py-4 shadow-sm">
      <div className="mb-3 text-sm font-semibold text-custom-text-100">AI 建议更新问卷头部信息</div>
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

const AiInlineQuestionnairePreview: React.FC<AiInlineQuestionnairePreviewProps> = ({
  mode,
  status,
  currentQuestionnaire,
  draftPartial,
  finalDraft,
  summary,
  errorMessage,
  warningMessage,
  draftApplied,
  selectedId,
  onApply,
  onDiscard,
  onBack
}) => {
  const previewDraft = finalDraft || draftPartial
  const isStreaming =
    status === 'connecting' ||
    status === 'thinking' ||
    status === 'answering' ||
    status === 'drafting'
  const isPartialDraft = Boolean(previewDraft && !finalDraft)
  const showAppliedQuestionnaire = draftApplied && !previewDraft
  const currentComponents = currentQuestionnaire.components || []
  const draftComponents = previewDraft?.components || []
  const showCurrentQuestionnaireFallback =
    !previewDraft &&
    Boolean(
      currentComponents.length > 0 ||
        currentQuestionnaire.title ||
        currentQuestionnaire.description ||
        currentQuestionnaire.footerText
    )
  const draftIndexMap = new Map(draftComponents.map((component, index) => [component.fe_id, index]))
  const draftComponentMap = new Map(draftComponents.map(component => [component.fe_id, component]))
  const addedInsertMap =
    mode === 'edit' ? buildAddedInsertMap(currentComponents, draftComponents) : new Map()
  const generateDraftHasBaseComponents =
    mode === 'generate' && generateDraftContainsCurrentComponents(previewDraft, currentComponents)
  const generateAddedInsertMap =
    mode === 'generate' && generateDraftHasBaseComponents
      ? buildAddedInsertMap(currentComponents, draftComponents)
      : new Map()
  const selectedIndex = currentComponents.findIndex(component => component.fe_id === selectedId)
  const generateInsertIndex = selectedIndex >= 0 ? selectedIndex + 1 : currentComponents.length
  const selectedComponent = selectedIndex >= 0 ? currentComponents[selectedIndex] : null
  const displayTitle =
    mode === 'generate' && currentComponents.length === 0 && previewDraft
      ? previewDraft.title || '未命名问卷'
      : currentQuestionnaire.title || previewDraft?.title || '未命名问卷'
  const displayDescription =
    mode === 'generate' && currentComponents.length === 0 && previewDraft
      ? previewDraft.description || '暂无描述'
      : currentQuestionnaire.description || previewDraft?.description || '暂无描述'
  const displayFooterText =
    mode === 'generate' && currentComponents.length === 0 && previewDraft
      ? previewDraft.footerText
      : currentQuestionnaire.footerText
  const streamingLabel =
    status === 'connecting'
      ? '连接中'
      : status === 'thinking'
      ? mode === 'generate'
        ? '理解需求中'
        : '分析问卷中'
      : status === 'answering'
      ? '整理说明中'
      : mode === 'generate'
      ? '草稿生成中'
      : '建议生成中'

  const hasDraftPreview = Boolean(previewDraft)
  const hasVisibleContent =
    hasDraftPreview && (currentComponents.length > 0 || draftComponents.length > 0)
  const generateStickyHint =
    mode === 'generate' ? (
      <div className="sticky top-0 z-20 -mx-1 mb-4 px-1 pt-1">
        <div className="rounded-2xl border border-[#F7D9A7] bg-[#FFF9ED]/95 px-4 py-3 text-sm text-[#7C5C00] shadow-sm backdrop-blur-sm">
          <div className="font-semibold text-[#9A6700]">新增题目插入位置</div>
          <div className="mt-1 leading-6">
            {selectedComponent ? (
              <>
                本次新增会插入到
                <span className="mx-1 font-semibold text-[#9A6700]">第 {selectedIndex + 1} 项</span>
                之后：
                <span className="ml-1 font-medium text-custom-text-100">
                  {selectedComponent.title || '未命名题目'}
                </span>
              </>
            ) : (
              '当前未选中组件，本次新增会直接追加到问卷末尾。'
            )}
          </div>
          {currentComponents.length > 0 && (
            <div className="mt-1 text-xs text-[#8C6A12]">
              如需改变位置，请先在左侧问卷图层中选中目标题目。
            </div>
          )}
        </div>
      </div>
    ) : null

  return (
    <div className="h-full flex flex-col overflow-hidden rounded-[22px] border border-custom-bg-200 bg-white/75 shadow-sm">
      <div className="flex h-[40px] items-center justify-between border-b border-[#f0f0f0] bg-[#fafafa] pl-4 rounded-t-[21px]">
        <div className="text-sm font-semibold text-[#167c72]">AI草稿预览</div>
        <div className="flex h-full items-end gap-[2px]">
          <div className="mt-[2px] flex items-center gap-2 mr-3 pb-[9px]">
            {isStreaming && (
              <Tag className="m-0" color="processing">
                {streamingLabel}
              </Tag>
            )}
            {status === 'draft_ready' && (
              <Tag className="m-0" color="success">
                草稿就绪
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
            onClick={!finalDraft || draftApplied ? undefined : onApply}
            className={`mr-2 flex h-[39px] items-center justify-center rounded-t-lg border border-b-0 px-4 text-[14px] transition-all duration-300 ${
              !finalDraft || draftApplied
                ? 'cursor-not-allowed border-[#f0f0f0] bg-[#fafafa] text-gray-400'
                : 'cursor-pointer border-transparent bg-gradient-to-r from-teal-500 to-emerald-400 font-semibold text-white shadow-[0_-2px_10px_rgba(20,184,166,0.3)] hover:opacity-90'
            }`}
          >
            {draftApplied ? '已应用到编辑器' : '应用到编辑器'}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-no-scrollbar bg-white/30 px-4 py-4">
        {errorMessage && (
          <Alert
            className="mb-4"
            type="error"
            showIcon
            message="AI 草稿生成失败"
            description={errorMessage}
          />
        )}

        {warningMessage && !errorMessage && (
          <Alert
            className="mb-4"
            type="warning"
            showIcon
            message="AI 已跳过部分解析失败的题目"
            description={warningMessage}
          />
        )}

        {mode === 'edit' && previewDraft && (
          <PageConfigSuggestion
            currentQuestionnaire={currentQuestionnaire}
            previewQuestionnaire={previewDraft}
          />
        )}

        {summary && previewDraft && (
          <div className="mb-4 rounded-3xl border border-custom-bg-200 bg-white/90 p-4 shadow-sm">
            <div className="mb-3 text-sm font-semibold text-custom-text-100">变更摘要</div>
            <div className="space-y-4">
              <SummaryTags label="新增" color="green" values={summary.added} />
              <SummaryTags label="更新" color="blue" values={summary.updated} />
              <SummaryTags label="删除" color="red" values={summary.deleted} />
            </div>
          </div>
        )}

        {hasDraftPreview ? (
          <div className="rounded-[28px] border border-custom-bg-200 bg-white/80 p-5 shadow-inner">
            {generateStickyHint}
            <div className="border-b border-custom-bg-200 pb-4 text-center">
              <div className="text-[26px] font-semibold tracking-[0.02em] text-custom-primary-200">
                {displayTitle}
              </div>
              <div className="mt-2 text-sm text-custom-text-200">{displayDescription}</div>
            </div>

            {hasVisibleContent ? (
              <div className="mt-5 space-y-4">
                {generateDraftHasBaseComponents && generateAddedInsertMap.get('__start__')?.length
                  ? (generateAddedInsertMap.get('__start__') || []).map(
                      (component: ComponentInfoType) => (
                        <PreviewCard
                          key={`generate-start-${component.fe_id}`}
                          tone="suggestion"
                          label={`AI 建议新增（应用后第 ${
                            (draftIndexMap.get(component.fe_id) || 0) + 1
                          } 项）`}
                          note="将插入到问卷开头"
                          component={component}
                        />
                      )
                    )
                  : null}

                {mode === 'edit' && addedInsertMap.get('__start__')?.length
                  ? (addedInsertMap.get('__start__') || []).map((component: ComponentInfoType) => (
                      <PreviewCard
                        key={`start-${component.fe_id}`}
                        tone="suggestion"
                        label={`AI 建议新增（应用后第 ${
                          (draftIndexMap.get(component.fe_id) || 0) + 1
                        } 项）`}
                        note="将插入到问卷开头"
                        component={component}
                      />
                    ))
                  : null}

                {currentComponents.map((component, index) => {
                  const draftComponent = draftComponentMap.get(component.fe_id)
                  const draftPosition = draftIndexMap.get(component.fe_id)
                  const isChanged =
                    !!draftComponent &&
                    mode === 'edit' &&
                    hasComponentChanged(component, draftComponent)
                  const isDeleted = mode === 'edit' && !isPartialDraft && !draftComponent
                  const generateInsertHere = mode === 'generate' && selectedIndex === index
                  const addedAfterCurrent =
                    mode === 'edit'
                      ? addedInsertMap.get(component.fe_id) || []
                      : generateDraftHasBaseComponents
                      ? generateAddedInsertMap.get(component.fe_id) || []
                      : []

                  return (
                    <React.Fragment key={component.fe_id}>
                      <PreviewCard
                        tone={isDeleted ? 'danger' : generateInsertHere ? 'anchor' : 'current'}
                        label={`当前第 ${index + 1} 项`}
                        note={
                          isDeleted
                            ? ''
                            : generateInsertHere
                            ? 'AI 新增内容会从这一项后面开始插入'
                            : undefined
                        }
                        component={component}
                      />

                      {isChanged && draftComponent && (
                        <PreviewCard
                          tone="suggestion"
                          label={`AI 建议改为第 ${(draftPosition || 0) + 1} 项`}
                          note="下方是 AI 生成的替换内容"
                          component={draftComponent}
                        />
                      )}

                      {addedAfterCurrent.map((component: ComponentInfoType) => (
                        <PreviewCard
                          key={`after-${component.fe_id}`}
                          tone="suggestion"
                          label={`AI 建议新增（应用后第 ${
                            (draftIndexMap.get(component.fe_id) || 0) + 1
                          } 项）`}
                          note={`将插入到当前第 ${index + 1} 项之后`}
                          component={component}
                        />
                      ))}

                      {mode === 'generate' &&
                        !generateDraftHasBaseComponents &&
                        previewDraft &&
                        index + 1 === generateInsertIndex &&
                        previewDraft.components.map((draftComponent, draftIndex) => (
                          <PreviewCard
                            key={`generate-${draftComponent.fe_id}-${draftIndex}`}
                            tone="suggestion"
                            label={`AI 建议新增（应用后第 ${
                              generateInsertIndex + draftIndex + 1
                            } 项）`}
                            note={
                              selectedIndex >= 0
                                ? `将插入到当前第 ${selectedIndex + 1} 项之后`
                                : '将追加到问卷末尾'
                            }
                            component={draftComponent}
                          />
                        ))}
                    </React.Fragment>
                  )
                })}

                {mode === 'generate' &&
                  previewDraft &&
                  currentComponents.length === 0 &&
                  previewDraft.components.map((component, index) => (
                    <PreviewCard
                      key={`generate-empty-${component.fe_id}-${index}`}
                      tone="suggestion"
                      label={`AI 建议新增（第 ${index + 1} 项）`}
                      note="应用后会直接创建到当前问卷中"
                      component={component}
                    />
                  ))}
              </div>
            ) : (
              <div className="mt-5 flex min-h-[320px] items-center justify-center rounded-3xl border-2 border-dashed border-custom-bg-200 bg-white/90">
                <Empty
                  description={
                    mode === 'generate' &&
                    (status === 'connecting' ||
                      status === 'thinking' ||
                      status === 'answering' ||
                      status === 'drafting')
                      ? 'AI 正在生成问卷草稿，内容会持续显示在这里'
                      : mode === 'generate'
                      ? '左侧输入需求后，可先点“润色”，也可直接点“发送”；开始生成后这里会显示 AI 问卷草稿'
                      : '左侧输入修改指令后，AI 建议会直接标注在原问卷对应位置'
                  }
                />
              </div>
            )}

            {displayFooterText && (
              <div className="pt-5 text-center text-sm text-custom-text-200">
                {displayFooterText}
              </div>
            )}
          </div>
        ) : showAppliedQuestionnaire ? (
          <div className="rounded-[28px] border border-custom-bg-200 bg-white/80 p-5 shadow-inner">
            <div className="mb-4 rounded-3xl border border-[#CFEAE4] bg-white/80 px-4 py-3 text-sm text-custom-text-100 shadow-sm">
              当前展示的是已应用到编辑器的最新内容。
            </div>

            <div className="border-b border-custom-bg-200 pb-4 text-center">
              <div className="text-[26px] font-semibold tracking-[0.02em] text-custom-primary-200">
                {currentQuestionnaire.title || '未命名问卷'}
              </div>
              <div className="mt-2 text-sm text-custom-text-200">
                {currentQuestionnaire.description || '暂无描述'}
              </div>
            </div>

            {currentComponents.length > 0 ? (
              <div className="mt-5 space-y-4">
                {currentComponents.map((component, index) => (
                  <PreviewCard
                    key={`applied-${component.fe_id}-${index}`}
                    tone="current"
                    label={`当前第 ${index + 1} 项`}
                    note="该内容已应用到编辑器"
                    component={component}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-5 flex min-h-[320px] items-center justify-center rounded-3xl border-2 border-dashed border-custom-bg-200 bg-white/90">
                <Empty description="草稿已应用，当前问卷暂无题目" />
              </div>
            )}

            {currentQuestionnaire.footerText && (
              <div className="pt-5 text-center text-sm text-custom-text-200">
                {currentQuestionnaire.footerText}
              </div>
            )}
          </div>
        ) : showCurrentQuestionnaireFallback ? (
          <div className="rounded-[28px] border border-custom-bg-200 bg-white/80 p-5 shadow-inner">
            {mode === 'edit' ? (
              <div className="mb-4 rounded-3xl border border-[#CFEAE4] bg-white/80 px-4 py-3 text-sm text-custom-text-100 shadow-sm">
                当前展示的是可供 AI 修改的问卷内容。发送修改指令后，AI 建议会直接标注在这里。
              </div>
            ) : (
              <div className="mb-4 rounded-3xl border border-[#CFEAE4] bg-white/80 px-4 py-3 text-sm text-custom-text-100 shadow-sm">
                当前展示的是问卷基线内容。切到生成模式后，AI 新增内容会在这份问卷基础上插入。
              </div>
            )}

            {generateStickyHint}

            <div className="border-b border-custom-bg-200 pb-4 text-center">
              <div className="text-[26px] font-semibold tracking-[0.02em] text-custom-primary-200">
                {currentQuestionnaire.title || '未命名问卷'}
              </div>
              <div className="mt-2 text-sm text-custom-text-200">
                {currentQuestionnaire.description || '暂无描述'}
              </div>
            </div>

            {currentComponents.length > 0 ? (
              <div className="mt-5 space-y-4">
                {currentComponents.map((component, index) => (
                  <PreviewCard
                    key={`current-edit-${component.fe_id}-${index}`}
                    tone={mode === 'generate' && selectedIndex === index ? 'anchor' : 'current'}
                    label={`当前第 ${index + 1} 项`}
                    note={mode === 'edit' ? '这是当前问卷内容' : 'AI 会基于这份问卷继续新增内容'}
                    component={component}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-5 flex min-h-[320px] items-center justify-center rounded-3xl border-2 border-dashed border-custom-bg-200 bg-white/90">
                <Empty
                  description={
                    mode === 'edit'
                      ? '当前问卷暂无题目，输入修改指令后 AI 建议会显示在这里'
                      : '当前问卷暂无题目，切到生成模式后 AI 新增内容会显示在这里'
                  }
                />
              </div>
            )}

            {currentQuestionnaire.footerText && (
              <div className="pt-5 text-center text-sm text-custom-text-200">
                {currentQuestionnaire.footerText}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-5 flex min-h-[320px] items-center justify-center rounded-3xl border-2 border-dashed border-custom-bg-200 bg-white/90">
            <Empty
              description={
                mode === 'generate' &&
                (status === 'connecting' ||
                  status === 'thinking' ||
                  status === 'answering' ||
                  status === 'drafting')
                  ? 'AI 正在生成问卷草稿，内容会持续显示在这里'
                  : mode === 'generate'
                  ? '左侧输入需求后，可先点“润色”，也可直接点“发送”；开始生成后这里会显示 AI 问卷草稿'
                  : '左侧输入修改指令后，AI 建议会直接标注在原问卷对应位置'
              }
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default AiInlineQuestionnairePreview
