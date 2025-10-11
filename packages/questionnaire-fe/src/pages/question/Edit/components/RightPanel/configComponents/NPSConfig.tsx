import React, { useEffect, useCallback } from 'react'
import { Form, Input, InputNumber } from 'antd'
import { useSelector, useDispatch } from 'react-redux'
import { RootState } from '@/store'
import { updateComponentProps } from '@/store/modules/componentsSlice'
import { QuestionNPSPropsType } from '@/components/QuestionComponents/QuestionNPS'
import { useDebouncedValidate } from '../../../hooks/useDebouncedValidate'

interface NPSConfigProps {
  componentId: string
}

const NPSConfig: React.FC<NPSConfigProps> = ({ componentId }) => {
  const dispatch = useDispatch()
  const [form] = Form.useForm()

  // 从Redux获取组件数据
  const componentList = useSelector((state: RootState) => state.components.componentList)
  const currentComponent = componentList.find(c => c.fe_id === componentId)

  // 组件数据变化时，重置表单
  useEffect(() => {
    if (currentComponent) {
      form.setFieldsValue(currentComponent.props)
    }
  }, [currentComponent, form])

  // 验证通过后更新预览
  const onValidSuccess = useCallback(
    (allValues: any) => {
      if (!currentComponent) return

      dispatch(
        updateComponentProps({
          fe_id: componentId,
          newProps: allValues as QuestionNPSPropsType
        })
      )
    },
    [currentComponent, componentId, dispatch]
  )

  // 防抢验证函数
  const handleValuesChange = useDebouncedValidate(form, onValidSuccess)

  if (!currentComponent) return null

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold">配置</h3>
      </div>
      <Form form={form} layout="vertical" initialValues={currentComponent.props}>
        <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="min" label="最小值">
          <InputNumber min={0} max={9} />
        </Form.Item>
        <Form.Item name="max" label="最大值">
          <InputNumber min={1} max={10} />
        </Form.Item>
        <Form.Item name="minLabel" label="最小值标签">
          <Input />
        </Form.Item>
        <Form.Item name="maxLabel" label="最大值标签">
          <Input />
        </Form.Item>
      </Form>
    </div >
  )
}

export default NPSConfig
