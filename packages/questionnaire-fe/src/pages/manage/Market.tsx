import React, { useEffect, useRef, useState } from 'react'
import { useInViewport, useTitle } from 'ahooks'
import QuestionCard from '@/components/Common/QuestionCard'
import ListSearch from '@/components/Common/ListSearch'
import { Typography, FloatButton, Empty } from 'antd'
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
  useTitle('小木问卷 - 问卷市场')
  const bottomRef = useRef(null)
  const [currentView, setCurrentView] = useState(1)
  const [questionList, setQuestionList] = useState<Question[]>([])
  const [search, setSearch] = useState('')
  const [total, setTotal] = useState(10)
  const dispatch = useDispatch()
  const { isRequestSuccess } = useRequestSuccessChecker()

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
        <Typography.Text className="text-[20px] font-semibold text-gray-800 tracking-wide">
          问卷市场
        </Typography.Text>
        <div className="w-64">
          <ListSearch searchChange={searchChange} />
        </div>
      </div>
      <div className="flex-1 px-6 pb-6 overflow-y-auto custom-no-scrollbar" ref={questionListRef}>
        {/* 问卷列表 */}
        {questionList.length > 0 ? (
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
              />
            ))}
          </div>
        ) : (
          <Empty className="mt-40" description="暂无问卷" />
        )}
        <FloatButton.BackTop target={targetFn} visibilityHeight={120} />
        <div
          ref={bottomRef}
          className="py-6 text-sm text-center text-gray-500 flex items-center justify-center gap-2"
        >
          {questionList.length >= total && total ? (
            <>
              <span role="img" aria-label="cone">
                📣
              </span>
              <span>duang! 到底啦!</span>
              <span role="img" aria-label="cone">
                📣
              </span>
            </>
          ) : (
            ''
          )}
        </div>
      </div>
    </div>
  )
}

export default Market
