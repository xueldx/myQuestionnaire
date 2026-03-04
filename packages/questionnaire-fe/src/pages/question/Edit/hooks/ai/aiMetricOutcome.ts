import apis from '@/apis'

export type AiMetricOutcomePatch = {
  draftApplied?: boolean
  discarded?: boolean
  autoSaveSucceeded?: boolean
  autoSaveFailed?: boolean
}

export const reportAiMetricOutcome = async (
  requestId: string | null | undefined,
  payload: AiMetricOutcomePatch
) => {
  if (!requestId) return false

  try {
    const response = await apis.aiApi.reportMetricOutcome(requestId, payload)
    return response.code === 1 && Boolean(response.data?.updated)
  } catch (error) {
    console.warn('上报 AI 指标 outcome 失败:', error)
    return false
  }
}
