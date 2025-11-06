import React, { useEffect, useCallback } from 'react'
import { Form, Input, Button } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import { useSelector, useDispatch } from 'react-redux'
import { RootState } from '@/store'
import { updateComponentProps } from '@/store/modules/componentsSlice'
import { QuestionMatrixCheckboxPropsType } from '@/components/QuestionComponents/QuestionMatrixCheckbox'
import { normalizeStringList } from '@/utils/normalizeQuestionComponent'
import { useDebouncedValidate } from '../../../hooks/useDebouncedValidate'

interface MatrixCheckboxConfigProps {
  componentId: string
}

const MatrixCheckboxConfig: React.FC<MatrixCheckboxConfigProps> = ({ componentId }) => {
  const dispatch = useDispatch()
  const [form] = Form.useForm()

  // 从Redux获取组件数据
  const componentList = useSelector((state: RootState) => state.components.componentList)
  const currentComponent = componentList.find(c => c.fe_id === componentId)

  // 组件数据变化时，重置表单
  useEffect(() => {
    if (currentComponent) {
      form.setFieldsValue({
        title: currentComponent.props.title
      })
    }
  }, [currentComponent, form])

  // 获取行选项
  const getRows = (): string[] => {
    if (!currentComponent) return []
    return normalizeStringList((currentComponent.props as QuestionMatrixCheckboxPropsType).rows)
  }

  // 获取列选项
  const getColumns = (): string[] => {
    if (!currentComponent) return []
    return normalizeStringList((currentComponent.props as QuestionMatrixCheckboxPropsType).columns)
  }

  // 立即更新组件属性的方法（用于行列操作）
  const updatePropsImmediately = (newProps: Partial<QuestionMatrixCheckboxPropsType>) => {
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
        newProps: updatedProps as QuestionMatrixCheckboxPropsType
      })
    )
  }

  // 添加行选项
  const addRow = () => {
    const currentRows = getRows()
    const newRows = [...currentRows, `行选项${currentRows.length + 1}`]
    updatePropsImmediately({ rows: newRows })
  }

  // 删除行选项
  const deleteRow = (index: number) => {
    const currentRows = getRows()
    if (currentRows.length <= 1) return

    const newRows = currentRows.filter((_, i) => i !== index)
    updatePropsImmediately({ rows: newRows })
  }

  // 修改行选项文本
  const changeRowText = (index: number, text: string) => {
    const currentRows = getRows()
    const newRows = [...currentRows]
    newRows[index] = text
    updatePropsImmediately({ rows: newRows })
  }

  // 添加列选项
  const addColumn = () => {
    const currentColumns = getColumns()
    const newColumns = [...currentColumns, `列选项${currentColumns.length + 1}`]
    updatePropsImmediately({ columns: newColumns })
  }

  // 删除列选项
  const deleteColumn = (index: number) => {
    const currentColumns = getColumns()
    if (currentColumns.length <= 1) return

    const newColumns = currentColumns.filter((_, i) => i !== index)
    updatePropsImmediately({ columns: newColumns })
  }

  // 修改列选项文本
  const changeColumnText = (index: number, text: string) => {
    const currentColumns = getColumns()
    const newColumns = [...currentColumns]
    newColumns[index] = text
    updatePropsImmediately({ columns: newColumns })
  }

  // 验证通过后更新预览（表单字段的防抖验证）
  const onValidSuccess = useCallback(
    (allValues: any) => {
      if (!currentComponent) return

      dispatch(
        updateComponentProps({
          fe_id: componentId,
          newProps: {
            ...currentComponent.props,
            ...allValues,
            rows: getRows(),
            columns: getColumns()
          } as QuestionMatrixCheckboxPropsType
        })
      )
    },
    [currentComponent, componentId, dispatch]
  )

  // 防抖验证函数（仅用于表单字段）
  const handleValuesChange = useDebouncedValidate(form, onValidSuccess)

  if (!currentComponent) return null

  // 获取选项列表
  const rows = getRows()
  const columns = getColumns()

  return (
    <div>
      <div className="mb-4">
        <h3 className="font-bold">配置</h3>
      </div>
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          title: currentComponent.props.title
        }}
        onValuesChange={handleValuesChange}
      >
        <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
          <Input />
        </Form.Item>
        <Form.Item label="行选项" required>
          <div className="space-y-2">
            {rows.map((row: string, index: number) => (
              <div key={index} className="flex items-center gap-2">
                <Input value={row} onChange={e => changeRowText(index, e.target.value)} />
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => deleteRow(index)}
                  disabled={rows.length <= 1}
                />
              </div>
            ))}
            <Button type="dashed" icon={<PlusOutlined />} onClick={addRow} block>
              添加行选项
            </Button>
          </div>
        </Form.Item>
        <Form.Item label="列选项" required>
          <div className="space-y-2">
            {columns.map((column: string, index: number) => (
              <div key={index} className="flex items-center gap-2">
                <Input value={column} onChange={e => changeColumnText(index, e.target.value)} />
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => deleteColumn(index)}
                  disabled={columns.length <= 1}
                />
              </div>
            ))}
            <Button type="dashed" icon={<PlusOutlined />} onClick={addColumn} block>
              添加列选项
            </Button>
          </div>
        </Form.Item>
      </Form>
    </div>
  )
}

export default MatrixCheckboxConfig
