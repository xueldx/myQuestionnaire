import React, { useEffect, useCallback } from 'react'
import { Form, Input, InputNumber, Switch } from 'antd'
import { useSelector, useDispatch } from 'react-redux'
import { RootState } from '@/store'
import { updateComponentProps } from '@/store/modules/componentsSlice'
import { QuestionTitlePropsType } from '@/components/QuestionComponents/QuestionTitle'
import { useDebouncedValidate } from '../../../hooks/useDebouncedValidate'

interface TitleConfigProps {
  componentId: string
}

const TitleConfig: React.FC<TitleConfigProps> = ({ componentId }) => {
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
          newProps: allValues as QuestionTitlePropsType
        })
      )
    },
    [currentComponent, componentId, dispatch]
  )

  // 防抖验证函数
  const handleValuesChange = useDebouncedValidate(form, onValidSuccess)

  if (!currentComponent) return null

  return (
    <div>
      <div className="mb-4">
        <h3 className="font-bold">配置</h3>
      </div>
      <Form
        form={form}
        layout="vertical"
        initialValues={currentComponent.props}
        onValuesChange={handleValuesChange}
      >
        <Form.Item
          name="title"
          label="标题文本"
          rules={[{ required: true, message: '请输入标题文本' }]}
        >
          <Input.TextArea rows={4} />
        </Form.Item>
        <Form.Item name="level" label="标题级别">
          <InputNumber min={1} max={5} />
        </Form.Item>
        <Form.Item name="isCenter" label="是否居中" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="fontSize" label="字体大小">
          <InputNumber min={12} max={36} />
        </Form.Item>
      </Form>
    </div>
  )
}

export default TitleConfig
