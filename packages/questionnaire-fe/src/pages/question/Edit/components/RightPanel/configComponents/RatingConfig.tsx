import React, { useEffect, useCallback } from 'react'
import { Form, Input, InputNumber, Switch, Select } from 'antd'
import { useSelector, useDispatch } from 'react-redux'
import { RootState } from '@/store'
import { updateComponentProps } from '@/store/modules/componentsSlice'
import { QuestionRatingPropsType } from '@/components/QuestionComponents/QuestionRating'
import { useDebouncedValidate } from '../../../hooks/useDebouncedValidate'

interface RatingConfigProps {
  componentId: string
}

const RatingConfig: React.FC<RatingConfigProps> = ({ componentId }) => {
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
          newProps: allValues as QuestionRatingPropsType
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
      <Form
        form={form}
        layout="vertical"
        initialValues={currentComponent.props}
        onValuesChange={handleValuesChange}
      >
        <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="count" label="评分数量">
          <InputNumber min={1} max={10} />
        </Form.Item>
        <Form.Item name="allowHalf" label="允许半星" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="character" label="评分图标">
          <Select>
            <Select.Option value="star">星星</Select.Option>
            <Select.Option value="heart">心形</Select.Option>
          </Select>
        </Form.Item>
      </Form>
    </div>
  )
}

export default RatingConfig
