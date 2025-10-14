import React, { useEffect, useRef } from 'react'
import clsx from 'clsx'
import { useSelector, useDispatch } from 'react-redux'
import { RootState } from '@/store'
import { setSelectedId } from '@/store/modules/componentsSlice'
import { MenuOutlined } from '@ant-design/icons'
import { Tooltip } from 'antd'

type ComponentWapperProps = {
  children: React.ReactNode
  fe_id: string
  dragHandleProps?: any
  isDragging?: boolean
}

const ComponentWapper: React.FC<ComponentWapperProps> = ({
  children,
  fe_id,
  dragHandleProps,
  isDragging = false
}) => {
  const selectedId = useSelector((state: RootState) => state.components.selectedId)
  const dispatch = useDispatch()
  const dragHandleRef = useRef<HTMLDivElement>(null)

  // 点击组件时选中
  const handleClick = () => {
    if (selectedId === fe_id) {
      dispatch(setSelectedId(''))
    } else {
      dispatch(setSelectedId(fe_id))
    }
  }

  // 调试拖拽手柄属性
  useEffect(() => {
    if (dragHandleRef.current && dragHandleProps) {
      console.log(`拖拽手柄 (${fe_id}) 属性:`, dragHandleProps)
      // 确保dragHandleProps中的事件处理程序能够正确绑定
      if (dragHandleProps.onMouseDown) {
        console.log(`拖拽手柄 (${fe_id}) 已绑定 onMouseDown 事件`)
      } else {
        console.warn(`拖拽手柄 (${fe_id}) 缺少 onMouseDown 事件`)
      }
    }
  }, [dragHandleProps, fe_id])

  // 确保draggableProps正确应用到组件上
  return (
    <div
      className={clsx(
        'group p-4 bg-white rounded-lg mb-4 border border-transparent hover:border-custom-primary-100 relative shadow-sm hover:shadow',
        selectedId === fe_id && '!border-custom-primary-100 shadow-md',
        isDragging && 'opacity-90 border-dashed border-custom-primary-100 shadow-lg rotate-1'
      )}
      onClick={handleClick}
    >
      {/* 拖拽手柄 - 使用自定义事件监听，确保拖拽可以触发 */}
      <Tooltip title="拖拽排序" placement="top" mouseEnterDelay={0.5}>
        <div
          ref={dragHandleRef}
          {...dragHandleProps}
          onMouseDown={e => {
            console.log(`拖拽手柄 (${fe_id}) 鼠标按下事件触发`)
            if (dragHandleProps?.onMouseDown) {
              dragHandleProps.onMouseDown(e)
            }
          }}
          className={clsx(
            'absolute right-0 top-0 h-8 px-2.5 flex items-center justify-center bg-custom-bg-100 text-custom-text-200 cursor-grab active:cursor-grabbing rounded-bl-lg rounded-tr-md opacity-0 group-hover:opacity-100',
            selectedId === fe_id && 'opacity-100 bg-custom-primary-100 text-white',
            isDragging &&
              'opacity-100 cursor-grabbing bg-custom-primary-100 text-white shadow-inner'
          )}
          style={{
            cursor: isDragging ? 'grabbing' : 'grab'
          }}
        >
          <MenuOutlined className="text-[14px]" />
        </div>
      </Tooltip>

      {/* 左侧状态标识横条 */}
      {selectedId === fe_id && !isDragging && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-custom-primary-100 rounded-l-lg shadow-[1px_0_4px_rgba(38,166,154,0.3)]"></div>
      )}

      {/* 组件内容 */}
      <div className={clsx(isDragging && 'transform scale-[0.98] opacity-90')}>{children}</div>
    </div>
  )
}

export default ComponentWapper
