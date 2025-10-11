import React, { useEffect, useCallback } from 'react'
import { Form, Input, InputNumber } from 'antd'
import { useSelector, useDispatch } from 'react-redux'
import { RootState } from '@/store'
import { updateComponentProps } from '@/store/modules/componentsSlice'
import { QuestionParagraphPropsType } from '@/components/QuestionComponents/QuestionParagraph'
import { useDebouncedValidate } from '../../../hooks/useDebouncedValidate'

interface ParagraphConfigProps {
  componentId: string
}

const ParagraphConfig: React.FC<ParagraphConfigProps> = ({ componentId }) => {
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
          newProps: allValues as QuestionParagraphPropsType
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
        <Form.Item
          name="title"
          label="段落内容"
          rules={[{ required: true, message: '请输入段落内容' }]}
        >
          <Input.TextArea rows={4} />
        </Form.Item>
        <Form.Item name="placeholder" label="提示文本">
          <Input />
        </Form.Item>
        <Form.Item name="rows" label="行数">
          <InputNumber min={1} max={10} />
        </Form.Item>
      </Form>
    </div>
  )
}

export default ParagraphConfig
