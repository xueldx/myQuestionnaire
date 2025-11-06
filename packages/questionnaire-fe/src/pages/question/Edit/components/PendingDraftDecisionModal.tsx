import React from 'react'
import { Button, Modal, Tooltip } from 'antd'

interface PendingDraftDecisionModalProps {
  open: boolean
  onClose: () => void
  onAppend: () => void
  onRegenerate: () => void
}

const PendingDraftDecisionModal: React.FC<PendingDraftDecisionModalProps> = ({
  open,
  onClose,
  onAppend,
  onRegenerate
}) => {
  return (
    <Modal
      open={open}
      title="要继续追加当前草稿，还是整份重新生成？"
      onCancel={onClose}
      maskClosable
      closable
      keyboard
      centered
      destroyOnClose
      footer={[
        <Tooltip title="放弃旧草稿并重新生成" key="regenerate">
          <Button onClick={onRegenerate}>重新生成</Button>
        </Tooltip>,
        <Tooltip title="继续追加当前草稿（推荐）" key="append">
          <Button type="primary" onClick={onAppend}>
            继续追加
          </Button>
        </Tooltip>
      ]}
    >
      当前有一份未应用的 AI
      草稿。继续追加会把新题目接在这份草稿后面；整份重新生成会先放弃旧草稿，再按本轮需求重新开始。
    </Modal>
  )
}

export default PendingDraftDecisionModal
