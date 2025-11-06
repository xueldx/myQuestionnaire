import React from 'react'
import EditorButton from '@/components/Editor/EditorButton'
import { operationType } from '@/pages/question/Edit/components/type'
import { DeleteOutlined } from '@ant-design/icons'

interface EditorButtonGroupProps {
  operation: (type: operationType) => void
}

const EditorButtonGroup = (props: EditorButtonGroupProps) => {
  const { operation } = props
  return (
    <>
      <EditorButton
        icon="save"
        title="保存当前问卷"
        onClick={() => operation(operationType.save)}
      />
      <EditorButton
        icon="back"
        title="撤销上一步操作"
        onClick={() => operation(operationType.back)}
      />
      <EditorButton
        icon="forward"
        title="恢复上一步操作"
        onClick={() => operation(operationType.forward)}
      />
      <EditorButton
        iconNode={<DeleteOutlined />}
        title="删除当前组件"
        hoverClassName="hover:bg-red-500 hover:text-white"
        onClick={() => operation(operationType.delete)}
      />
    </>
  )
}

export default EditorButtonGroup
