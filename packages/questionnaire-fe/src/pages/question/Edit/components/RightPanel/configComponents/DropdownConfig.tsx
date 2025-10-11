import React, { useEffect, useCallback } from 'react'
import { Form, Input, Button } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import { useSelector, useDispatch } from 'react-redux'
import { RootState } from '@/store'
import { updateComponentProps } from '@/store/modules/componentsSlice'
import { QuestionDropdownPropsType } from '@/components/QuestionComponents/QuestionDropdown'
import { useDebouncedValidate } from '../../../hooks/useDebouncedValidate'

interface DropdownConfigProps {
  componentId: string
}

const DropdownConfig: React.FC<DropdownConfigProps> = ({ componentId }) => {
  const dispatch = useDispatch()
  const [form] = Form.useForm()

  // 从Redux获取组件数据
  const componentList = useSelector((state: RootState) => state.components.componentList)
  const currentComponent = componentList.find(c => c.fe_id === componentId)

  // 组件数据变化时，重置表单
  useEffect(() => {
    if (currentComponent) {
      form.setFieldsValue({
        title: currentComponent.props.title,
        placeholder: (currentComponent.props as QuestionDropdownPropsType).placeholder
      })
    }
  }, [currentComponent, form])

  // 获取当前选项列表
  const getOptions = (): string[] => {
    if (!currentComponent) return []
    return (currentComponent.props as QuestionDropdownPropsType).options || []
  }

  // 立即更新组件属性的方法（用于选项操作）
  const updatePropsImmediately = (newProps: Partial<QuestionDropdownPropsType>) => {
    if (!currentComponent) return

    const formValues = form.getFieldsValue()
    const updatedProps = {
      ...currentComponent.props,
      ...formValues,
      ...newProps
    }

    dispatch(
      updateComponentProps({
        fe_id: componentId,
        newProps: updatedProps as QuestionDropdownPropsType
      })
    )
  }

  // 添加选项
  const addOption = () => {
    const currentOptions = getOptions()
    const newOptions = [...currentOptions, `新选项${currentOptions.length + 1}`]
    updatePropsImmediately({ options: newOptions })
  }

  // 删除选项
  const deleteOption = (index: number) => {
    const currentOptions = getOptions()
    if (currentOptions.length <= 1) return

    const newOptions = currentOptions.filter((_, i) => i !== index)
    updatePropsImmediately({ options: newOptions })
  }

  // 修改选项文本
  const changeOptionText = (index: number, text: string) => {
    const currentOptions = getOptions()
    const newOptions = [...currentOptions]
    newOptions[index] = text
    updatePropsImmediately({ options: newOptions })
  }

  // 验证通过后更新预览（表单字段的防抢验证）
  const onValidSuccess = useCallback(
    (allValues: any) => {
      if (!currentComponent) return

      dispatch(
        updateComponentProps({
          fe_id: componentId,
          newProps: {
            ...currentComponent.props,
            ...allValues,
            options: getOptions()
          } as QuestionDropdownPropsType
        })
      )
    },
    [currentComponent, componentId, dispatch]
  )

  // 防抢验证函数（仅用于表单字段）
  const handleValuesChange = useDebouncedValidate(form, onValidSuccess)

  if (!currentComponent) return null

  // 获取选项列表
  const options = getOptions()

  return (
    <div>
      <div className="mb-4">
        <h3 className="font-bold">配置</h3>
      </div>
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          title: currentComponent.props.title,
          placeholder: (currentComponent.props as QuestionDropdownPropsType).placeholder
        }}
        onValuesChange={handleValuesChange}
      >
        <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="placeholder" label="提示文本">
          <Input />
        </Form.Item>
        <Form.Item label="选项" required>
          <div className="space-y-2">
            {options.map((option: string, index: number) => (
              <div key={index} className="flex items-center gap-2">
                <Input value={option} onChange={e => changeOptionText(index, e.target.value)} />
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => deleteOption(index)}
                  disabled={options.length <= 1}
                />
              </div>
            ))}
            <Button type="dashed" icon={<PlusOutlined />} onClick={addOption} block>
              添加选项
            </Button>
          </div>
        </Form.Item>
      </Form>
    </div>
  )
}

export default DropdownConfig
