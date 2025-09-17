import React, { useMemo } from 'react'
import { Button, Divider, Popconfirm, Space, Tag, Tooltip } from 'antd'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  LineChartOutlined,
  QuestionCircleOutlined,
  StarOutlined,
  FieldTimeOutlined,
  QrcodeOutlined
} from '@ant-design/icons'
import { Link, useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import apis from '@/apis'
import useRequestSuccessChecker from '@/hooks/useRequestSuccessChecker'
import { QUESTION_DETAIL_PATH, QUESTION_EDIT_PATH, QUESTION_STAT_PATH, QRCODE_PATH } from '@/router'
import { getUserInfoFromStorage } from '@/utils'

// ts 自定义类型
type PropsType = {
  id: number
  title: string
  isFavorated: boolean
  isPublished: boolean
  author: string
  answerCount: number
  createdAt: string
  updatedAt: string
  editable: boolean
  onRefresh: (id: number) => Promise<void>
  onDelete: () => void
}

const QuestionCard: React.FC<PropsType> = (props: PropsType) => {
  const nav = useNavigate()
  const { isRequestSuccess, successMessage } = useRequestSuccessChecker()
  const {
    id,
    title,
    isFavorated,
    isPublished,
    author,
    answerCount,
    createdAt,
    updatedAt,
    editable,
    onRefresh,
    onDelete
  } = props

  // 收藏或取消收藏
  const handleFavorate = async () => {
    const res = !isFavorated
      ? await apis.questionApi.favorateQuestion(id)
      : await apis.questionApi.unFavorateQuestion(id)
    if (isRequestSuccess(res)) {
      onRefresh(id)
      successMessage(res.msg)
    }
  }

  // 发布或取消发布问卷
  const publish = async () => {
    const res = isPublished
      ? await apis.questionApi.unPublishQuestion(id)
      : await apis.questionApi.publishQuestion(id)
    if (isRequestSuccess(res)) {
      onRefresh(id)
      successMessage(res.msg)
    }
  }

  // 复制问卷
  const duplicate = async () => {
    try {
      // 1. 创建新问卷
      const userInfo = getUserInfoFromStorage()
      const createRes = await apis.questionApi.createQuestion({
        author_id: userInfo.userId,
        author: userInfo.nickname || '未知'
      })

      if (!isRequestSuccess(createRes)) {
        successMessage('创建新问卷失败')
        return
      }

      const newQuestionId = createRes.data.id

      // 2. 跳转到新问卷的编辑页面，并传递原问卷ID作为复制源
      nav(`${QUESTION_EDIT_PATH}/${newQuestionId}?copyFrom=${id}`)
    } catch (error) {
      console.error('复制问卷失败:', error)
      successMessage('复制问卷失败，请稍后重试')
    }
  }

  // 删除问卷
  const del = async () => {
    const res = await apis.questionApi.deleteQuestion(id)
    if (isRequestSuccess(res)) {
      onDelete()
      successMessage(res.msg)
    }
  }

  // 查看答题二维码
  const checkQrcode = () => {
    window.open(`${window.location.origin}${QRCODE_PATH}/${id}`)
  }

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm hover:shadow border border-white/60 p-5 flex flex-col transition-all duration-300 relative group overflow-hidden">
      <div className="flex gap-4 mb-4 relative z-10">
        <div className="shrink-0 w-12 h-14 bg-[#4B847A] rounded-lg flex flex-col items-center justify-center text-white shadow-inner">
          <div className="w-6 h-1.5 bg-white/40 rounded-full mb-1"></div>
          <div className="flex items-center gap-1 mb-1">
            <div className="w-2 h-2 rounded-full border border-white/60 flex items-center justify-center">
              <div className="w-1 h-1 bg-white rounded-full"></div>
            </div>
            <div className="w-3 h-0.5 bg-white rounded-full"></div>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full border border-white/60 flex items-center justify-center">
              <div className="w-1 h-1 bg-white rounded-full"></div>
            </div>
            <div className="w-3 h-0.5 bg-white rounded-full"></div>
          </div>
        </div>

        <div className="flex-1 w-0">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold text-gray-800 truncate pr-2 text-[15px]">
              <Link
                to={`${QUESTION_DETAIL_PATH}/${id}`}
                className="hover:text-[#26a69a] text-inherit"
              >
                {title}
              </Link>
            </div>
            {isPublished ? (
              <span className="shrink-0 px-2.5 py-0.5 bg-[#26a69a] text-white text-[11px] rounded-full">
                已发布
              </span>
            ) : (
              <span className="shrink-0 px-2.5 py-0.5 bg-[#B8D5D0] text-[#26a69a] text-[11px] rounded-full">
                未发布
              </span>
            )}
          </div>

          <div className="text-[12px] text-gray-400 space-y-1">
            <div>创建时间: {dayjs(createdAt).format('YYYY-MM-DD HH:mm:ss')}</div>
            <div>更新日期: {dayjs(updatedAt).format('YYYY-MM-DD')}</div>
          </div>
        </div>
      </div>

      <div className="h-[1px] bg-gray-200/60 w-full mb-3 relative z-10"></div>

      <div className="flex items-center justify-around relative z-10">
        {editable && (
          <Tooltip title="编辑问卷">
            <Button
              type="text"
              size="small"
              className="text-gray-500 hover:!text-[#26a69a] hover:!bg-transparent"
              icon={<EditOutlined className="text-[16px]" />}
              onClick={() => nav(`${QUESTION_EDIT_PATH}/${id}`)}
              disabled={!editable}
            />
          </Tooltip>
        )}
        {editable && (
          <Tooltip title="统计">
            <Button
              type="text"
              size="small"
              className="text-gray-500 hover:!text-[#26a69a] hover:!bg-transparent"
              icon={<LineChartOutlined className="text-[16px]" />}
              onClick={() => nav(`${QUESTION_STAT_PATH}/${id}`)}
              disabled={!isPublished || !editable || !answerCount}
            />
          </Tooltip>
        )}
        <Tooltip title={isFavorated ? '取消星标' : '星标'}>
          <Button
            type="text"
            size="small"
            className={`${
              isFavorated ? 'text-yellow-500' : 'text-gray-500'
            } hover:!bg-transparent hover:!text-yellow-500`}
            icon={<StarOutlined className="text-[16px]" />}
            onClick={handleFavorate}
          />
        </Tooltip>
        <Tooltip title="复制">
          <Popconfirm
            title="确定复制该问卷？"
            onConfirm={duplicate}
            okButtonProps={{ style: { backgroundColor: '#26A69A' } }}
          >
            <Button
              type="text"
              size="small"
              className="text-gray-500 hover:!text-[#26a69a] hover:!bg-transparent"
              icon={<CopyOutlined className="text-[16px]" />}
            />
          </Popconfirm>
        </Tooltip>

        {isPublished && (
          <Tooltip title="答题链接/二维码">
            <Button
              type="text"
              size="small"
              className="text-gray-500 hover:!text-[#26a69a] hover:!bg-transparent"
              onClick={checkQrcode}
              icon={<QrcodeOutlined className="text-[16px]" />}
            />
          </Tooltip>
        )}
        {editable && (
          <Tooltip title="删除">
            <Popconfirm
              title="确定删除该问卷？"
              onConfirm={del}
              okButtonProps={{ style: { backgroundColor: '#26A69A' } }}
              icon={<QuestionCircleOutlined className="text-custom-red" />}
            >
              <Button
                type="text"
                size="small"
                className="text-gray-500 hover:!text-[#26a69a] hover:!bg-transparent"
                icon={<DeleteOutlined className="text-[16px]" />}
              />
            </Popconfirm>
          </Tooltip>
        )}
      </div>
    </div>
  )
}

export default QuestionCard
