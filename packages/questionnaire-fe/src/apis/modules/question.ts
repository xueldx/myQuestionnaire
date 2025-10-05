import request from '@/utils/request'
import { RespType } from './types/common'
import qs from 'qs'
import { QuestionListType } from '@/hooks/types'
import { QuestionListResponse, QuestionnaireDetail } from './types/question'

// 统一前缀
const prefix = '/api/question'

/**
 * 获取问卷列表
 */
const getQuestionList = (page: number, limit: number, search: string, type: QuestionListType) =>
  request.get<any, RespType<QuestionListResponse>>(
    `${prefix}?${qs.stringify({ page, limit, search, type })}`
  )

/**
 * 获取问卷详情
 */
const getQuestionById = (id: number) => request.get<number, RespType<any>>(`${prefix}/${id}`)

/**
 * 创建问卷
 */
const createQuestion = (params: { author_id?: number; author?: string }) =>
  request.post<any, RespType<{ id: number }>>(`${prefix}`, params)

/**
 * 更新问卷
 */
const updateQuestion = (id: number, params: { title: string; description: string }) =>
  request.patch<any, RespType<any>>(`${prefix}/${id}`, params)

/**
 * 收藏问卷
 */
const favorateQuestion = (id: number) =>
  request.get<number, RespType<any>>(`${prefix}/favorate/${id}`)

/**
 * 取消收藏问卷
 */
const unFavorateQuestion = (id: number) =>
  request.delete<number, RespType<any>>(`${prefix}/favorate/${id}`)

/**
 * 删除问卷
 */
const deleteQuestion = (id: number) => request.delete<number, RespType<any>>(`${prefix}/${id}`)

/**
 * 批量删除问卷
 */
const deleteQuestions = (ids: number[]) =>
  request.post<any, RespType<any>>(`${prefix}/batch-delete`, { ids })

/**
 * 发布问卷
 */
const publishQuestion = (id: number) =>
  request.get<number, RespType<any>>(`${prefix}/publish/${id}`)

/**
 * 取消发布问卷
 */
const unPublishQuestion = (id: number) =>
  request.get<number, RespType<any>>(`${prefix}/unpublish/${id}`)

/**
 * 获取回收站问卷列表
 */
const getTrashList = (page: number, limit: number, search: string) =>
  request.get<any, RespType<QuestionListResponse>>(
    `${prefix}/trash/list?${qs.stringify({ page, limit, search })}`
  )

/**
 * 恢复单个问卷
 */
const restoreQuestion = (id: number) =>
  request.post<number, RespType<any>>(`${prefix}/${id}/restore`)

/**
 * 批量恢复问卷
 */
const restoreQuestions = (ids: number[]) =>
  request.post<any, RespType<any>>(`${prefix}/batch-restore`, { ids })

/**
 * 彻底删除单个问卷
 */
const permanentDeleteQuestion = (id: number) =>
  request.post<number, RespType<any>>(`${prefix}/${id}/permanent-delete`)

/**
 * 批量彻底删除问卷
 */
const permanentDeleteQuestions = (ids: number[]) =>
  request.post<any, RespType<any>>(`${prefix}/batch-permanent-delete`, { ids })

export default {
  getQuestionList,
  getQuestionById,
  createQuestion,
  favorateQuestion,
  unFavorateQuestion,
  deleteQuestion,
  deleteQuestions,
  updateQuestion,
  publishQuestion,
  unPublishQuestion,
  getTrashList,
  restoreQuestion,
  restoreQuestions,
  permanentDeleteQuestion,
  permanentDeleteQuestions
}
