import React, { useState } from 'react'
import clsx from 'clsx'
import SvgIcon from '@/components/Common/SvgIcon'
import { Tooltip } from 'antd'

interface EditorButtonProps {
  icon?: string
  iconNode?: React.ReactNode
  activeIcon?: string
  addtionalStyles?: string
  isDisabled?: boolean
  title?: string
  activeColor?: string
  hoverClassName?: string
  onClick?: () => void
}

// 默认样式
const defaultStyles =
  'size-8 rounded-full flex justify-center items-center cursor-pointer transition-all duration-300'

const disabledStyles =
  'size-8 rounded-full flex justify-center items-center cursor-not-allowed opacity-50 '

const EditorButton = ({
  icon = 'github',
  iconNode,
  activeIcon,
  addtionalStyles,
  isDisabled,
  title = '',
  activeColor = '',
  hoverClassName = 'hover:bg-custom-primary-100 hover:text-white',
  onClick
}: EditorButtonProps) => {
  // 状态管理 hover 状态
  const [isHovered, setIsHovered] = useState(false)

  // 根据 hover 状态选择图标
  const currentIcon = isHovered && activeIcon ? activeIcon : icon

  const iconColor = isHovered ? activeColor || 'white' : 'currentColor'

  const renderIcon = () => {
    if (iconNode) {
      return (
        <div
          style={{
            fontSize: '1.5rem',
            color: iconColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {iconNode}
        </div>
      )
    }
    return <SvgIcon name={currentIcon} size="1.5rem" color={iconColor} />
  }

  // 禁用状态直接返回禁用样式按钮
  if (isDisabled) {
    return (
      <Tooltip title={title}>
        <div className={clsx(disabledStyles, addtionalStyles)} onClick={onClick}>
          {renderIcon()}
        </div>
      </Tooltip>
    )
  }

  return (
    <Tooltip title={title}>
      <div
        className={clsx(defaultStyles, hoverClassName, addtionalStyles)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={onClick}
      >
        {renderIcon()}
      </div>
    </Tooltip>
  )
}

export default EditorButton
