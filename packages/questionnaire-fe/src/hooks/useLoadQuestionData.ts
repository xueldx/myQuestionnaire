import apis from '@/apis'
import { useParams } from 'react-router-dom'
import { useRequest } from 'ahooks'
import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { resetComponents } from '@/store/modules/componentsSlice'
import useRequestSuccessChecker from '@/hooks/useRequestSuccessChecker'
import { resetPageConfig } from '@/store/modules/pageConfigSlice'
import { RootState } from '@/store'
import { normalizeQuestionnaireComponentList } from '@/utils/normalizeQuestionComponent'

function useLoadQuestionData() {
  const { id = '' } = useParams()
  const dispatch = useDispatch()
  const { isRequestSuccess } = useRequestSuccessChecker()
  const pageConfig = useSelector((state: RootState) => state.pageConfig)

  // 加载问卷数据
  const { loading, data, error, run } = useRequest(
    async (id: string) => {
      if (!id) return null
      const res = await apis.editorApi.getQuestionnaireDetail(id)
      return res
    },
    {
      manual: true
    }
  )

  // 初始化加载
  useEffect(() => {
    if (!id) return
    const searchParams = new URLSearchParams(window.location.search)
    if (searchParams.get('copyFrom')) return
    run(id)
  }, [id, window.location.search])

  // 设置组件数据
  useEffect(() => {
    if (!data) return
    if (!isRequestSuccess(data)) return

    const { components: rawComponentList = [], selectedId = '', version = 1 } = data.data || {}
    const componentList = normalizeQuestionnaireComponentList(rawComponentList)

    // 重置 redux store
    dispatch(
      resetComponents({
        componentList,
        selectedId,
        version
      })
    )
    dispatch(
      resetPageConfig({
        ...pageConfig,
        title: data.data?.title || '',
        description: data.data?.description || '',
        footerText: data.data?.footer_text || ''
      })
    )
  }, [data])

  return { loading, error }
}

export default useLoadQuestionData
