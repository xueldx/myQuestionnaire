import React, { useEffect, useRef, useState } from 'react'
import { useInViewport, useTitle } from 'ahooks'
import QuestionCard from '@/components/Common/QuestionCard'
import ListSearch from '@/components/Common/ListSearch'
import {
  Typography,
  FloatButton,
  Empty,
  Table,
  Space,
  Button,
  Modal,
  Radio,
  Tag,
  Tooltip,
  ConfigProvider,
  Popconfirm,
  Select
} from 'antd'
import {
  AppstoreOutlined,
  BarsOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  EditOutlined,
  LineChartOutlined,
  StarOutlined,
  CopyOutlined,
  QrcodeOutlined,
  QuestionCircleOutlined
} from '@ant-design/icons'
import { Link, useNavigate } from 'react-router-dom'
import { QUESTION_DETAIL_PATH, QUESTION_EDIT_PATH, QUESTION_STAT_PATH, QRCODE_PATH } from '@/router'
import dayjs from 'dayjs'
import { useDispatch } from 'react-redux'
import { setScreenSpinning } from '@/store/modules/utilsSlice'
import { QuestionListType } from '@/hooks/types'
import useLoadQuestionList from '@/hooks/useLoadQuestionList'
import { useSelector } from 'react-redux'
import { RootState } from '@/store'
import apis from '@/apis'
import useRequestSuccessChecker from '@/hooks/useRequestSuccessChecker'
import { Question } from '@/apis/modules/types/question'

const { Title } = Typography
// 上拉加载步进长度
const stepSize = 20

const Market: React.FC = () => {
  useTitle('问卷小筑 - 模板中心')
  const bottomRef = useRef(null)
  const [activeTab, setActiveTab] = useState<'public' | 'private'>('public')
  const [currentView, setCurrentView] = useState(1)
  const [questionList, setQuestionList] = useState<Question[]>([])
  const [search, setSearch] = useState('')
  const [total, setTotal] = useState(10)
  const dispatch = useDispatch()
  const { isRequestSuccess, successMessage } = useRequestSuccessChecker()
  const nav = useNavigate()
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card')
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([])

  const handleBatchDelete = () => {
    Modal.confirm({
      title: '确认批量删除',
      icon: <ExclamationCircleOutlined className="text-custom-red" />,
      content: `确定要删除选中的 ${selectedRowKeys.length} 份问卷吗？`,
      okButtonProps: { style: { backgroundColor: '#26A69A' } },
      cancelButtonProps: { className: 'custom-cancel-btn' },
      onOk: async () => {
        const res = await apis.questionApi.deleteQuestions(selectedRowKeys)
        if (isRequestSuccess(res)) {
          successMessage(res.msg)
          setQuestionList(l => l.filter(item => !selectedRowKeys.includes(item.id)))
          setSelectedRowKeys([])
        }
      }
    })
  }

  const columns = [
    {
      title: '问卷标题',
      dataIndex: 'title',
      key: 'title',
      render: (text: string, record: any) => (
        <Space>
          <Link
            to={`${QUESTION_DETAIL_PATH}/${record.id}`}
            className="hover:text-[#26a69a] text-inherit font-semibold"
          >
            {text}
          </Link>
          {record.is_published ? <Tag color="#26a69a">已发布</Tag> : <Tag color="cyan">未发布</Tag>}
        </Space>
      )
    },
    {
      title: '答卷数量',
      dataIndex: 'answer_count',
      key: 'answer_count'
    },
    {
      title: '创建时间',
      dataIndex: 'create_time',
      key: 'create_time',
      render: (text: string) => dayjs(text).format('YYYY-MM-DD HH:mm:ss')
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: any) => {
        const isFavorated = record.is_favorated
        const isPublished = record.is_published
        const isEditable = editable(record)
        return (
          <Space size="small">
            {isEditable && (
              <Tooltip title="编辑问卷">
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => nav(`${QUESTION_EDIT_PATH}/${record.id}`)}
                />
              </Tooltip>
            )}
            {isEditable && (
              <Tooltip title="统计">
                <Button
                  type="text"
                  size="small"
                  icon={<LineChartOutlined />}
                  disabled={!isPublished || !record.answer_count}
                  onClick={() => nav(`${QUESTION_STAT_PATH}/${record.id}`)}
                />
              </Tooltip>
            )}
            <Tooltip title={isFavorated ? '取消星标' : '星标'}>
              <Button
                type="text"
                size="small"
                className={isFavorated ? 'text-yellow-500' : 'text-gray-500'}
                icon={<StarOutlined />}
                onClick={async () => {
                  const res = !isFavorated
                    ? await apis.questionApi.favorateQuestion(record.id)
                    : await apis.questionApi.unFavorateQuestion(record.id)
                  if (isRequestSuccess(res)) {
                    getQuestionItem(record.id)
                    successMessage(res.msg)
                  }
                }}
              />
            </Tooltip>
            {isPublished && (
              <Tooltip title="答题链接/二维码">
                <Button
                  type="text"
                  size="small"
                  onClick={() =>
                    window.open(`${window.location.origin}${QRCODE_PATH}/${record.id}`)
                  }
                  icon={<QrcodeOutlined />}
                />
              </Tooltip>
            )}
            <Tooltip title="复制">
              <Popconfirm
                title="确定复制该问卷？"
                onConfirm={async () => {
                  try {
                    const createRes = await apis.questionApi.createQuestion({
                      author_id: userInfo.userId,
                      author: userInfo.nickname || '未知'
                    })
                    if (!isRequestSuccess(createRes)) {
                      successMessage('创建新问卷失败')
                      return
                    }
                    nav(`${QUESTION_EDIT_PATH}/${createRes.data.id}?copyFrom=${record.id}`)
                  } catch (error) {
                    successMessage('复制问卷失败，请稍后重试')
                  }
                }}
                okButtonProps={{ style: { backgroundColor: '#26A69A' } }}
              >
                <Button type="text" size="small" icon={<CopyOutlined />} />
              </Popconfirm>
            </Tooltip>
            {isEditable && (
              <Tooltip title="删除">
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() => {
                    Modal.confirm({
                      title: '确定删除该问卷？',
                      icon: <QuestionCircleOutlined className="text-custom-red" />,
                      okButtonProps: { style: { backgroundColor: '#26A69A' } },
                      onOk: async () => {
                        const res = await apis.questionApi.deleteQuestion(record.id)
                        if (isRequestSuccess(res)) {
                          deleteQuestion(record.id)
                          successMessage(res.msg)
                        }
                      }
                    })
                  }}
                />
              </Tooltip>
            )}
          </Space>
        )
      }
    }
  ]

  const searchChange = (search: string) => {
    setSearch(search)
    setCurrentView(1)
  }

  const { loading, res } = useLoadQuestionList({
    currentView,
    stepSize,
    search,
    type: QuestionListType.ALL
  })

  const { userInfo } = useSelector((state: RootState) => state.profile)

  const editable = (item: any) => item.author_id === userInfo.userId

  // 当数据加载完成时更新 questionList
  useEffect(() => {
    if (res && res?.data?.list) {
      if (currentView === 1) {
        setQuestionList(res.data.list)
      } else {
        setQuestionList(questionList.concat(res.data.list))
      }
      setTotal(res?.data?.count || 0)
    }
  }, [res])

  useEffect(() => {
    dispatch(setScreenSpinning(loading))
  }, [loading])

  // 监听 isTouchBottom 变化，触发加载更多
  const [isTouchBottom] = useInViewport(bottomRef)
  useEffect(() => {
    if (isTouchBottom && questionList.length && questionList.length < total) {
      setCurrentView(currentView => currentView + 1)
    }
  }, [isTouchBottom])

  const getQuestionItem = async (id: number) => {
    const res = await apis.questionApi.getQuestionById(id)
    if (isRequestSuccess(res)) {
      setQuestionList(
        questionList.map(item => {
          if (item.id === id) {
            return res.data
          }
          return item
        })
      )
    }
  }

  const deleteQuestion = (id: number) => {
    setQuestionList(questionList.filter(item => item.id !== id))
  }

  const questionListRef = useRef(null)

  const targetFn = () => {
    return questionListRef.current as any
  }

  return (
    <div className="flex flex-col h-full bg-transparent w-full">
      <div className="flex justify-between items-center px-6 pt-6 pb-2 shrink-0">
        {/* 左侧：二级的子目录（公开模板 / 我的模板） */}
        <div className="flex gap-6 items-center">
          <div className="relative cursor-pointer pb-2" onClick={() => setActiveTab('public')}>
            <span
              className={`text-[18px] font-semibold tracking-wide transition-colors ${
                activeTab === 'public' ? 'text-[#408D86]' : 'text-black'
              }`}
            >
              公开模板
            </span>
            <div
              className={`absolute bottom-0 left-0 h-[3px] rounded-full bg-[#408D86] transition-all duration-300 ${
                activeTab === 'public' ? 'w-full' : 'w-0'
              }`}
            />
          </div>
          <div className="relative cursor-pointer pb-2" onClick={() => setActiveTab('private')}>
            <span
              className={`text-[18px] font-semibold tracking-wide transition-colors ${
                activeTab === 'private' ? 'text-[#408D86]' : 'text-black'
              }`}
            >
              我的模板
            </span>
            <div
              className={`absolute bottom-0 left-0 h-[3px] rounded-full bg-[#408D86] transition-all duration-300 ${
                activeTab === 'private' ? 'w-full' : 'w-0'
              }`}
            />
          </div>
        </div>

        {/* 右侧：操作区 */}
        <Space size="middle">
          {selectedRowKeys.length > 0 && (
            <Button size="large" danger icon={<DeleteOutlined />} onClick={handleBatchDelete}>
              批量删除 ({selectedRowKeys.length})
            </Button>
          )}
          <ConfigProvider
            theme={{
              components: {
                Radio: {
                  buttonSolidCheckedBg: '#529c94',
                  buttonSolidCheckedHoverBg: '#529c94',
                  buttonSolidCheckedActiveBg: '#529c94'
                }
              }
            }}
          >
            <Radio.Group
              value={viewMode}
              onChange={e => setViewMode(e.target.value)}
              buttonStyle="solid"
              size="large"
              className="custom-radio-group"
            >
              <Radio.Button value="card">
                <AppstoreOutlined />
              </Radio.Button>
              <Radio.Button value="list">
                <BarsOutlined />
              </Radio.Button>
            </Radio.Group>
          </ConfigProvider>
          <div className="w-64">
            <ListSearch searchChange={searchChange} />
          </div>
        </Space>
      </div>
      <div className="flex-1 px-6 pb-6 overflow-y-auto custom-no-scrollbar" ref={questionListRef}>
        {/* 问卷列表 */}
        {questionList.length > 0 ? (
          viewMode === 'card' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 content-start">
              {questionList.map((item: any) => (
                <QuestionCard
                  key={item.id}
                  id={item.id}
                  title={item.title}
                  isPublished={item.is_published}
                  isFavorated={item.is_favorated}
                  author={item.author}
                  editable={editable(item)}
                  answerCount={item.answer_count}
                  createdAt={item.create_time}
                  updatedAt={item.update_time}
                  onRefresh={getQuestionItem}
                  onDelete={() => deleteQuestion(item.id)}
                  checked={selectedRowKeys.includes(item.id)}
                  onCheckChange={checked => {
                    if (checked) setSelectedRowKeys([...selectedRowKeys, item.id])
                    else setSelectedRowKeys(selectedRowKeys.filter(k => k !== item.id))
                  }}
                />
              ))}
            </div>
          ) : (
            <Table
              rowKey="id"
              dataSource={questionList}
              columns={columns}
              pagination={false}
              rowSelection={{
                selectedRowKeys,
                onChange: keys => setSelectedRowKeys(keys as number[]),
                getCheckboxProps: record => ({ disabled: !editable(record) })
              }}
              className="bg-white/80 backdrop-blur-sm rounded-lg"
            />
          )
        ) : (
          <Empty className="mt-40" description="暂无问卷" />
        )}
        <FloatButton.BackTop target={targetFn} visibilityHeight={120} />
      </div>
    </div>
  )
}

export default Market
