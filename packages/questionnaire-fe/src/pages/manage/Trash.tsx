import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useInViewport, useTitle } from 'ahooks'
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
  ConfigProvider
} from 'antd'
import {
  AppstoreOutlined,
  BarsOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  UndoOutlined,
  QuestionCircleOutlined
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { useDispatch } from 'react-redux'
import { setScreenSpinning } from '@/store/modules/utilsSlice'
import useRequestSuccessChecker from '@/hooks/useRequestSuccessChecker'
import { Question } from '@/apis/modules/types/question'
import { useSelector } from 'react-redux'
import { RootState } from '@/store'
import apis from '@/apis'

const { Title } = Typography
// 上拉加载步进长度
const stepSize = 20

const Trash: React.FC = () => {
  useTitle('问卷小筑 - 回收站')
  const bottomRef = useRef(null)
  const [currentView, setCurrentView] = useState(1)
  const [questionList, setQuestionList] = useState<Question[]>([])
  const [search, setSearch] = useState('')
  const [total, setTotal] = useState(10)
  const [loading, setLoading] = useState(false)
  const dispatch = useDispatch()
  const { isRequestSuccess, successMessage } = useRequestSuccessChecker()
  const nav = useNavigate()
  const [viewMode, setViewMode] = useState<'card' | 'list'>('list')
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([])

  const { userInfo } = useSelector((state: RootState) => state.profile)

  // 加载回收站问卷列表
  const loadTrashQuestions = async (page: number) => {
    try {
      setLoading(true)
      const res = await apis.questionApi.getTrashList(page, stepSize, search)
      if (isRequestSuccess(res)) {
        if (page === 1) {
          setQuestionList(res.data.list)
        } else {
          setQuestionList(l => l.concat(res.data.list))
        }
        setTotal(res.data.count)
      }
    } finally {
      setLoading(false)
    }
  }

  // 监听搜索变化
  useEffect(() => {
    setCurrentView(1)
  }, [search])

  // 监听currentView变化，加载数据
  useEffect(() => {
    loadTrashQuestions(currentView)
  }, [currentView])

  // 监听搜索变化
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

  const handleBatchRestore = () => {
    Modal.confirm({
      title: '确认批量恢复',
      icon: <ExclamationCircleOutlined className="text-custom-red" />,
      content: `确定要恢复选中的 ${selectedRowKeys.length} 份问卷吗？`,
      okButtonProps: { style: { backgroundColor: '#26A69A' } },
      cancelButtonProps: { className: 'custom-cancel-btn' },
      onOk: async () => {
        const res = await apis.questionApi.restoreQuestions(selectedRowKeys)
        if (isRequestSuccess(res)) {
          successMessage(res.msg)
          setQuestionList(l => l.filter(item => !selectedRowKeys.includes(item.id)))
          setSelectedRowKeys([])
        }
      }
    })
  }

  const handleBatchPermanentDelete = () => {
    Modal.confirm({
      title: '确认批量彻底删除',
      icon: <ExclamationCircleOutlined className="text-custom-red" />,
      content: `确定要彻底删除选中的 ${selectedRowKeys.length} 份问卷吗？（此操作无法恢复）`,
      okButtonProps: { style: { backgroundColor: '#ff4d4f' } },
      cancelButtonProps: { className: 'custom-cancel-btn' },
      onOk: async () => {
        const res = await apis.questionApi.permanentDeleteQuestions(selectedRowKeys)
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
      render: (text: string) => <span className="font-semibold">{text}</span>
    },
    {
      title: '答卷数量',
      dataIndex: 'answer_count',
      key: 'answer_count'
    },
    {
      title: '删除时间',
      dataIndex: 'deleted_at',
      key: 'deleted_at',
      render: (text: string) => dayjs(text).format('YYYY-MM-DD HH:mm:ss')
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: any) => {
        return (
          <Space size="small">
            <Tooltip title="恢复">
              <Button
                type="text"
                size="small"
                icon={<UndoOutlined />}
                onClick={() => {
                  Modal.confirm({
                    title: '确定恢复该问卷？',
                    icon: <QuestionCircleOutlined className="text-custom-red" />,
                    okButtonProps: { style: { backgroundColor: '#26A69A' } },
                    onOk: async () => {
                      const res = await apis.questionApi.restoreQuestion(record.id)
                      if (isRequestSuccess(res)) {
                        setQuestionList(l => l.filter(item => item.id !== record.id))
                        successMessage(res.msg)
                      }
                    }
                  })
                }}
              />
            </Tooltip>
            <Tooltip title="彻底删除">
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                onClick={() => {
                  Modal.confirm({
                    title: '确定彻底删除该问卷？',
                    content: '此操作无法恢复，请谨慎操作',
                    icon: <QuestionCircleOutlined className="text-custom-red" />,
                    okButtonProps: { style: { backgroundColor: '#ff4d4f' } },
                    onOk: async () => {
                      const res = await apis.questionApi.permanentDeleteQuestion(record.id)
                      if (isRequestSuccess(res)) {
                        setQuestionList(l => l.filter(item => item.id !== record.id))
                        successMessage(res.msg)
                      }
                    }
                  })
                }}
              />
            </Tooltip>
          </Space>
        )
      }
    }
  ]

  const searchChange = (search: string) => {
    setSearch(search)
  }

  const questionListRef = useRef(null)

  return (
    <div className="flex flex-col h-full bg-transparent w-full">
      <div className="flex justify-between items-center px-6 pt-6 pb-2 shrink-0">
        <Typography.Text className="text-[20px] font-semibold text-gray-800 tracking-wide">
          回收站
        </Typography.Text>
        <Space size="middle">
          {selectedRowKeys.length > 0 && (
            <>
              <Button size="large" icon={<UndoOutlined />} onClick={handleBatchRestore}>
                批量恢复 ({selectedRowKeys.length})
              </Button>
              <Button
                size="large"
                danger
                icon={<DeleteOutlined />}
                onClick={handleBatchPermanentDelete}
              >
                彻底删除 ({selectedRowKeys.length})
              </Button>
            </>
          )}
          <div className="w-64">
            <ListSearch searchChange={searchChange} />
          </div>
        </Space>
      </div>
      <div className="flex-1 px-6 pb-6 overflow-y-auto custom-no-scrollbar" ref={questionListRef}>
        {/* 问卷列表 */}
        {questionList.length > 0 ? (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={questionList}
            pagination={false}
            rowSelection={{
              selectedRowKeys,
              onChange: selectedKeys => {
                setSelectedRowKeys(selectedKeys as number[])
              }
            }}
            loading={loading}
            scroll={{ x: 1000 }}
            className="bg-white rounded"
          />
        ) : (
          <Empty description="回收站为空" style={{ marginTop: '100px' }} />
        )}
        {questionList.length < total && (
          <div ref={bottomRef} style={{ height: '20px', marginTop: '20px' }} />
        )}
      </div>
    </div>
  )
}

export default Trash
