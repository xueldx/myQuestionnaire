import React, { useState, useEffect } from 'react'
import { useTitle } from 'ahooks'
import ListSearch from '@/components/Common/ListSearch'
import { Empty, Typography, Table, Space, Button, Tag, Tooltip, Modal, Popconfirm } from 'antd'
import { TablePaginationConfig } from 'antd/es/table'
import useLoadQuestionList from '@/hooks/useLoadQuestionList'
import { QuestionListType } from '@/hooks/types'
import dayjs from 'dayjs'
import { ColumnsType } from 'antd/es/table'
import {
  EditOutlined,
  CopyOutlined,
  DeleteOutlined,
  LineChartOutlined,
  StarOutlined,
  QrcodeOutlined,
  QuestionCircleOutlined
} from '@ant-design/icons'
import { useSelector } from 'react-redux'
import { RootState } from '@/store'
import { Question } from '@/apis/modules/types/question'
import { Link, useNavigate } from 'react-router-dom'
import { QUESTION_DETAIL_PATH, QUESTION_EDIT_PATH, QUESTION_STAT_PATH, QRCODE_PATH } from '@/router'
import apis from '@/apis'
import useRequestSuccessChecker from '@/hooks/useRequestSuccessChecker'

const { Title } = Typography

const Star: React.FC = () => {
  useTitle('问卷小筑 - 星标问卷')
  const [questionList, setQuestionList] = useState<Question[]>([])
  const nav = useNavigate()
  const { isRequestSuccess, successMessage } = useRequestSuccessChecker()

  const [pagination, setPagination] = useState<TablePaginationConfig>({
    position: ['bottomCenter'],
    current: 1,
    pageSize: 20,
    total: 0,
    showTotal: (total: number) => `共 ${total} 条`,
    showQuickJumper: true,
    showSizeChanger: true,
    pageSizeOptions: ['20', '50', '100']
  })

  const [search, setSearch] = useState('')

  const { loading, res } = useLoadQuestionList({
    currentView: pagination.current || 1,
    stepSize: pagination.pageSize || 10,
    search: search,
    type: QuestionListType.FAVORATE
  })

  const { userInfo } = useSelector((state: RootState) => state.profile)

  const editable = (item: any) => item.author_id === userInfo.userId

  useEffect(() => {
    if (res && res?.data?.list) {
      setQuestionList(res.data.list)
      setPagination({
        ...pagination,
        total: res.data.count
      })
    }
  }, [res])

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

  const columns: ColumnsType<any> = [
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
      title: '创建时间',
      dataIndex: 'create_time',
      key: 'createTime',
      render: (createTime: string) => {
        return dayjs(createTime).format('YYYY-MM-DD HH:mm:ss')
      }
    },
    {
      title: '更新时间',
      dataIndex: 'update_time',
      key: 'updateTime',
      render: (updateTime: string) => {
        return dayjs(updateTime).format('YYYY-MM-DD HH:mm:ss')
      }
    },
    {
      title: '答卷数量',
      dataIndex: 'answer_count',
      key: 'answerCount'
    },
    {
      title: '作者',
      dataIndex: 'author',
      key: 'author'
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description'
    },
    {
      title: '操作',
      key: 'action',
      fixed: 'right',
      width: '240px',
      render: (text, record) => {
        const isFavorated = record.is_favorated
        const isPublished = record.is_published
        const isEditable = editable(record)
        return (
          <Space key={`action-${record.id}`} size="small">
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
                    // 如果是取消收藏，直接从列表中移除（因为这是星标问卷页面）
                    if (isFavorated) {
                      setQuestionList(l => l.filter(item => item.id !== record.id))
                    } else {
                      getQuestionItem(record.id)
                    }
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
                      content: '删除后问卷将进入回收站，可在回收站中恢复',
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

  const handleTableChange = (pagination: any) => {
    setPagination({
      ...pagination,
      current: pagination.current,
      pageSize: pagination.pageSize
    })
  }

  const searchChange = (search: string) => {
    setSearch(search)
    setPagination({
      ...pagination,
      current: 1
    })
  }

  // 记录选中的id
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  return (
    <div className="flex flex-col h-full bg-transparent w-full">
      <div className="flex justify-between items-center px-6 pt-6 pb-2 shrink-0">
        <Typography.Text className="text-[20px] font-semibold text-gray-800 tracking-wide">
          星标问卷
        </Typography.Text>
        <div className="w-64">
          <ListSearch searchChange={searchChange} />
        </div>
      </div>
      <div className="px-6 pb-6 flex-1 flex flex-col overflow-y-auto custom-no-scrollbar">
        {/* 问卷列表 */}
        {questionList.length === 0 ? (
          <Empty className="mt-40" description="暂无星标问卷" />
        ) : (
          <Table
            bordered
            dataSource={questionList}
            columns={columns}
            loading={loading}
            rowKey={record => record.id}
            pagination={pagination}
            onChange={handleTableChange}
            scroll={{ y: 'calc(100vh - 307px)' }}
            rowSelection={{
              type: 'checkbox',
              onChange: selectedRowKeys => {
                setSelectedIds(selectedRowKeys as string[])
              }
            }}
          />
        )}
      </div>
    </div>
  )
}

export default Star
