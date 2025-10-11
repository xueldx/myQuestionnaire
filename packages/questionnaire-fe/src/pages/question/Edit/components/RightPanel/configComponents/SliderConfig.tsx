import React, { useEffect, useCallback } from 'react'
import { Form, Input, InputNumber, Switch } from 'antd'
import { useSelector, useDispatch } from 'react-redux'
import { RootState } from '@/store'
import { updateComponentProps } from '@/store/modules/componentsSlice'
import { QuestionSliderPropsType } from '@/components/QuestionComponents/QuestionSlider'
import { useDebouncedValidate } from '../../../hooks/useDebouncedValidate'

interface SliderConfigProps {
  componentId: string
}

const SliderConfig: React.FC<SliderConfigProps> = ({ componentId }) => {
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
          newProps: allValues as QuestionSliderPropsType
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
      <div className="mb-4">
        <h3 className="font-bold">配置</h3>
      </div>
      <Form form={form} layout="vertical" initialValues={currentComponent.props} onValuesChange={handleValuesChange}>
        <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="min" label="最小值">
          <InputNumber />
        </Form.Item>
        <Form.Item name="max" label="最大值">
          <InputNumber />
        </Form.Item>
        <Form.Item name="step" label="步长">
          <InputNumber min={0.1} />
        </Form.Item>
        <Form.Item name="defaultValue" label="默认值">
          <InputNumber />
        </Form.Item>
        <Form.Item name="showMarks" label="显示刻度" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="disabled" label="禁用交互" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </div>
  )
}

export default SliderConfig
