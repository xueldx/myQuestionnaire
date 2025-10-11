import React, { useEffect, useCallback } from 'react'
import { Form, Input, Switch, Select } from 'antd'
import { useSelector, useDispatch } from 'react-redux'
import { RootState } from '@/store'
import { updateComponentProps } from '@/store/modules/componentsSlice'
import { QuestionDatePropsType } from '@/components/QuestionComponents/QuestionDate'
import { useDebouncedValidate } from '../../../hooks/useDebouncedValidate'

interface DateConfigProps {
  componentId: string
}

const DateConfig: React.FC<DateConfigProps> = ({ componentId }) => {
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
          newProps: allValues as QuestionDatePropsType
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
        <Form.Item name="placeholder" label="提示文本">
          <Input />
        </Form.Item>
        <Form.Item name="showTime" label="显示时间" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="format" label="日期格式">
          <Select>
            <Select.Option value="YYYY-MM-DD">YYYY-MM-DD</Select.Option>
            <Select.Option value="YYYY/MM/DD">YYYY/MM/DD</Select.Option>
            <Select.Option value="YYYY-MM-DD HH:mm:ss">YYYY-MM-DD HH:mm:ss</Select.Option>
            <Select.Option value="YYYY/MM/DD HH:mm:ss">YYYY/MM/DD HH:mm:ss</Select.Option>
          </Select>
        </Form.Item>
      </Form>
    </div>
  )
}

export default DateConfig
