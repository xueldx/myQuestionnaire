import { LeftOutlined, SendOutlined } from '@ant-design/icons'
import { Button, Tooltip, App } from 'antd'
import React, { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import EditorButtonGroup from '@/pages/question/Edit/components/EditorButtonGroup'
import { operationType } from '@/pages/question/Edit/components/type'
import EditCanvas from '@/pages/question/Edit/EditCanvas'
import useLoadQuestionData from '@/hooks/useLoadQuestionData'
import CustomSpin from '@/components/CustomSpin/CustomSpin'
import LeftPanel from '@/pages/question/Edit/components/LeftPanel'
import RightPanel from '@/pages/question/Edit/components/RightPanel'
import AiCopilotPanel from '@/pages/question/Edit/components/AiCopilotPanel'
import AiInlineQuestionnairePreview from '@/pages/question/Edit/components/AiInlineQuestionnairePreview'
import PendingDraftDecisionModal from '@/pages/question/Edit/components/PendingDraftDecisionModal'
import useAiWorkbench from '@/pages/question/Edit/hooks/useAiWorkbench'
import { useSelector, useDispatch } from 'react-redux'
import { RootState } from '@/store'
import apis from '@/apis'
import { QUESTION_EDIT_PATH, MANAGE_PERSONAL_PATH } from '@/router/index'
import {
  setVersion,
  deleteComponent,
  resetComponents,
  undo,
  redo
} from '@/store/modules/componentsSlice'
import { resetPageConfig } from '@/store/modules/pageConfigSlice'
import useRequestSuccessChecker from '@/hooks/useRequestSuccessChecker'
import { getUserInfoFromStorage } from '@/utils'
import { normalizeQuestionnaireComponentList } from '@/utils/normalizeQuestionComponent'

const Edit: React.FC = () => {
  const navigate = useNavigate()
  const { id = '' } = useParams()
  const [searchParams] = useSearchParams()
  const [submitting, setSubmitting] = useState(false)
  const [leftPanelActiveKey, setLeftPanelActiveKey] = useState('market')
  const { loading } = useLoadQuestionData()
  const componentList = useSelector((state: RootState) => state.components.componentList)
  const pageConfig = useSelector((state: RootState) => state.pageConfig)
  const version = useSelector((state: RootState) => state.components.version)
  const historyIndex = useSelector((state: RootState) => state.components.historyIndex)
  const historyLength = useSelector((state: RootState) => state.components.history.length)
  const selectedId = useSelector((state: RootState) => state.components.selectedId)
  const dispatch = useDispatch()
  const { isRequestSuccess } = useRequestSuccessChecker()
  const { message, modal } = App.useApp()
  const aiWorkbench = useAiWorkbench(id)
  const [lastNonAiPanelKey, setLastNonAiPanelKey] = useState('market')
  const previousLeftPanelKeyRef = React.useRef(leftPanelActiveKey)

  const copyExecutedRef = React.useRef(false)

  useEffect(() => {
    if (leftPanelActiveKey !== 'ai') {
      setLastNonAiPanelKey(leftPanelActiveKey)
    }
  }, [leftPanelActiveKey])

  useEffect(() => {
    const previousKey = previousLeftPanelKeyRef.current
    previousLeftPanelKeyRef.current = leftPanelActiveKey

    if (leftPanelActiveKey !== 'ai' || previousKey === 'ai') return
    if (componentList.length === 0) {
      void aiWorkbench.openFreshGenerateEntrySession()
      return
    }

    void aiWorkbench.openFreshEditEntrySession()
  }, [aiWorkbench, componentList.length, leftPanelActiveKey])

  useEffect(() => {
    const copyFrom = searchParams.get('copyFrom')
    if (copyFrom && !copyExecutedRef.current) {
      copyExecutedRef.current = true
      const copyQuestionnaire = async () => {
        try {
          const detailRes = await apis.editorApi.getQuestionnaireDetail(copyFrom)
          if (!isRequestSuccess(detailRes)) {
            message.error('获取原问卷详情失败')
            return
          }

          const questionnaireDetail = detailRes.data
          const normalizedComponents = normalizeQuestionnaireComponentList(
            questionnaireDetail.components || []
          )

          dispatch(
            resetComponents({
              selectedId: questionnaireDetail.selectedId,
              componentList: normalizedComponents,
              version: 1
            })
          )

          dispatch(
            resetPageConfig({
              title: `${questionnaireDetail.title} (复制)`,
              description: questionnaireDetail.description,
              footerText: questionnaireDetail.footer_text || ''
            })
          )

          const userInfo = getUserInfoFromStorage()
          const saveRes = await apis.editorApi.saveQuestionnaireDetail({
            questionnaire_id: parseInt(id) || 0,
            title: `${questionnaireDetail.title} (复制)`,
            description: questionnaireDetail.description,
            footer_text: questionnaireDetail.footer_text || '',
            components: normalizedComponents,
            version: 1,
            creator: userInfo.nickname || '未知'
          })

          if (!isRequestSuccess(saveRes)) {
            message.error('保存问卷详情失败')
            return
          }

          if (saveRes.data && typeof saveRes.data.version === 'number') {
            dispatch(setVersion(saveRes.data.version))
          }

          message.success('复制成功')
          navigate(`${QUESTION_EDIT_PATH}/${id}`, { replace: true })
        } catch (error) {
          console.error('复制问卷失败:', error)
          message.error('复制问卷失败，请稍后重试')
        }
      }

      copyQuestionnaire()
    }
  }, [id, searchParams])

  const saveQuestionnaire = async () => {
    if (componentList.length === 0) {
      message.warning('请先添加问卷组件')
      return false
    }

    try {
      const userInfo = getUserInfoFromStorage()
      const creator = userInfo.nickname || '未知'
      const params = {
        questionnaire_id: parseInt(id) || 0,
        title: pageConfig.title || '未命名问卷',
        description: pageConfig.description || '',
        footer_text: pageConfig.footerText || '',
        components: componentList,
        version,
        creator
      }

      const res = await apis.editorApi.saveQuestionnaireDetail(params)
      if (isRequestSuccess(res)) {
        message.success('保存成功')
        if (res.data && typeof res.data.version === 'number') {
          dispatch(setVersion(res.data.version))
        } else {
          dispatch(setVersion(version + 1))
        }
        await apis.questionApi.updateQuestion(parseInt(id) || 0, {
          title: pageConfig.title || '未命名问卷',
          description: pageConfig.description || ''
        })
        return true
      }

      message.error(res.msg || '保存失败')
      return false
    } catch (error) {
      console.error('保存问卷失败:', error)
      message.error('保存问卷失败，请稍后重试')
      return false
    }
  }

  const operationMap = {
    [operationType.generate]: () => setLeftPanelActiveKey('ai'),
    [operationType.save]: saveQuestionnaire,
    [operationType.back]: () => {
      if (historyIndex > 0) {
        dispatch(undo())
        message.success('撤销成功')
      } else {
        message.info('没有可撤销的操作')
      }
    },
    [operationType.forward]: () => {
      if (historyIndex < historyLength - 1) {
        dispatch(redo())
        message.success('前进成功')
      } else {
        message.info('没有可前进的操作')
      }
    },
    [operationType.delete]: () => {
      if (selectedId) {
        dispatch(deleteComponent(selectedId))
        message.success('删除成功')
      } else {
        message.warning('请选择要删除的组件')
      }
    }
  }

  const operation = (type: operationType) => {
    operationMap[type]()
  }

  const confirmQuestionnaire = async () => {
    if (submitting) return

    if (componentList.length === 0) {
      message.warning('请先添加问卷组件')
      return
    }

    modal.confirm({
      title: '发布问卷',
      content: '确定要发布该问卷吗？发布后其他用户可填写问卷。',
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        setSubmitting(true)
        try {
          const saveSuccess = await saveQuestionnaire()
          if (!saveSuccess) {
            setSubmitting(false)
            return
          }

          const publicSucess = await apis.questionApi.publishQuestion(parseInt(id))

          if (!publicSucess) {
            setSubmitting(false)
            return
          }

          message.success('问卷发布成功')
          navigate(MANAGE_PERSONAL_PATH)
        } catch (error) {
          console.error('问卷发布失败:', error)
          message.error('提交发布失败，请稍后重试')
        } finally {
          setSubmitting(false)
        }
      }
    })
  }

  const isAiWorkbenchActive = leftPanelActiveKey === 'ai'

  return (
    <div className="w-full min-w-[1440px] h-screen overflow-x-auto overflow-y-hidden bg-gradient-to-br from-[#E8F5F3] to-[#F1F8E9] flex flex-col relative">
      {/* 岛屿式悬浮工具栏 */}
      <div
        className={`absolute top-2 left-1/2 -translate-x-1/2 z-50 flex items-center bg-white/75 backdrop-blur-xl border border-white/50 shadow-xl rounded-full px-4 py-1 transition-all duration-300 hover:shadow-2xl hover:bg-white/90 ${
          isAiWorkbenchActive ? 'opacity-0 pointer-events-none -translate-y-4' : 'opacity-100'
        }`}
      >
        <div className="flex justify-center items-center px-3">
          <Tooltip title="返回管理页">
            <Button
              type="text"
              shape="circle"
              icon={<LeftOutlined className="text-gray-600" />}
              onClick={() => navigate(-1)}
              className="flex justify-center items-center hover:!bg-gray-200"
            />
          </Tooltip>
        </div>

        <div className="w-px h-5 bg-gray-300/60 mx-2 pointer-events-none select-none shrink-0" />

        <div className="flex justify-center items-center gap-2 px-4">
          <EditorButtonGroup operation={operation} />
        </div>

        <div className="w-px h-5 bg-gray-300/60 mx-2 pointer-events-none select-none shrink-0" />

        <div className="flex justify-center items-center px-3">
          <Tooltip title="发布问卷">
            <Button
              type="primary"
              shape="round"
              icon={<SendOutlined />}
              onClick={confirmQuestionnaire}
              loading={submitting}
              className="flex justify-center items-center bg-gradient-to-r from-teal-400 to-emerald-400 border-none shadow-sm hover:opacity-90 font-medium px-4 h-8"
            >
              发布
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* 面板容器 */}
      <div className="flex-1 relative overflow-hidden">
        <div
          className={`absolute left-0 right-0 flex justify-between gap-3 px-3 pb-3 transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] will-change-transform ${
            isAiWorkbenchActive ? '-translate-y-[44px]' : 'translate-y-0'
          }`}
          style={{
            top: isAiWorkbenchActive ? '44px' : '56px',
            height: isAiWorkbenchActive ? '100%' : 'calc(100% - 56px)'
          }}
        >
          <div
            className="w-[390px] bg-custom-bg-300/60 backdrop-blur-md rounded-3xl shadow-2xl p-2 flex flex-col overflow-y-auto border border-white/20 isolate"
            style={{
              maskImage: 'radial-gradient(white, black)',
              WebkitMaskImage: '-webkit-radial-gradient(white, black)'
            }}
          >
            <LeftPanel
              activeKey={leftPanelActiveKey}
              onActiveChange={setLeftPanelActiveKey}
              aiTabContent={
                <AiCopilotPanel
                  mode={aiWorkbench.mode}
                  status={aiWorkbench.status}
                  messages={aiWorkbench.messages}
                  conversationList={aiWorkbench.conversationList}
                  activeConversationId={aiWorkbench.activeConversationId}
                  conversationLoading={aiWorkbench.conversationLoading}
                  conversationListLoading={aiWorkbench.conversationListLoading}
                  modelList={aiWorkbench.modelList}
                  selectedModel={aiWorkbench.selectedModel}
                  composerInput={aiWorkbench.composerInput}
                  errorMessage={aiWorkbench.errorMessage}
                  hasGenerateBase={
                    componentList.length > 0 ||
                    Boolean(
                      aiWorkbench.finalDraft?.components?.length ||
                        aiWorkbench.draftPartial?.components?.length
                    )
                  }
                  onModeChange={aiWorkbench.setMode}
                  onModelChange={aiWorkbench.setSelectedModel}
                  onComposerInputChange={aiWorkbench.setComposerInput}
                  onCreateConversation={() => {
                    void aiWorkbench.openNewConversation()
                  }}
                  onSelectConversation={conversationId => {
                    void aiWorkbench.selectConversation(conversationId)
                  }}
                  onRenameConversation={(conversationId, title) => {
                    return aiWorkbench.renameConversation(conversationId, title)
                  }}
                  onToggleConversationPin={conversationId => {
                    return aiWorkbench.toggleConversationPin(conversationId)
                  }}
                  onDeleteConversation={conversationId => {
                    return aiWorkbench.removeConversation(conversationId)
                  }}
                  onSend={aiWorkbench.sendInstruction}
                  onPolish={aiWorkbench.polishInstruction}
                  onCancel={aiWorkbench.cancelStream}
                />
              }
            />
          </div>

          <div className="flex-1 overflow-hidden flex flex-col">
            {loading ? (
              <div className="w-full h-full rounded-[40px] p-[10px] shadow-2xl bg-custom-bg-100 border-custom-bg-300 border-8 flex justify-center items-center">
                <CustomSpin />
              </div>
            ) : (
              <div
                className="h-full bg-custom-bg-300/60 backdrop-blur-md rounded-3xl shadow-2xl p-2 flex flex-col overflow-hidden border border-white/20 isolate"
                style={{
                  maskImage: 'radial-gradient(white, black)',
                  WebkitMaskImage: '-webkit-radial-gradient(white, black)'
                }}
              >
                {isAiWorkbenchActive ? (
                  <AiInlineQuestionnairePreview
                    mode={aiWorkbench.mode}
                    status={aiWorkbench.status}
                    currentQuestionnaire={{
                      title: pageConfig.title,
                      description: pageConfig.description,
                      footerText: pageConfig.footerText,
                      components: componentList
                    }}
                    draftPartial={aiWorkbench.draftPartial}
                    finalDraft={aiWorkbench.finalDraft}
                    summary={aiWorkbench.summary}
                    errorMessage={aiWorkbench.errorMessage}
                    warningMessage={aiWorkbench.warningMessage}
                    draftApplied={aiWorkbench.draftApplied}
                    selectedId={selectedId}
                    onApply={aiWorkbench.applyDraft}
                    onDiscard={aiWorkbench.discardDraft}
                    onBack={() => setLeftPanelActiveKey(lastNonAiPanelKey || 'market')}
                  />
                ) : (
                  <div className="h-full overflow-hidden rounded-[22px] border border-custom-bg-200 bg-white/75 shadow-sm isolate">
                    <EditCanvas />
                  </div>
                )}
              </div>
            )}
          </div>

          <div
            className="w-[350px] bg-custom-bg-300/60 backdrop-blur-md rounded-3xl shadow-2xl p-2 flex flex-col overflow-y-auto border border-white/20 isolate"
            style={{
              maskImage: 'radial-gradient(white, black)',
              WebkitMaskImage: '-webkit-radial-gradient(white, black)'
            }}
          >
            <RightPanel />
          </div>
        </div>
      </div>

      <PendingDraftDecisionModal
        open={aiWorkbench.isPendingDraftDecisionOpen}
        onClose={aiWorkbench.closePendingDraftDecision}
        onAppend={() => {
          void aiWorkbench.appendPendingDraft()
        }}
        onRegenerate={() => {
          void aiWorkbench.regeneratePendingDraft()
        }}
      />
    </div>
  )
}

export default Edit
