/**
 * 核心职责：提供问卷编辑器里“单个题目卡片”的统一外壳，承接选中态、拖拽手柄、拖拽中视觉反馈这三类交互。
 * 所属层次：UI 展示层。它本身不决定排序规则，只负责把上层传入的交互能力正确落到 DOM 上。
 * 模块关系：
 * - 被 `EditCanvas` 同时用于正常列表项和 `DragOverlay` 预览项，保证拖拽前后视觉结构一致。
 * - 依赖 `componentsSlice.setSelectedId` 更新当前选中题目；这个 reducer 会写入历史记录，因此点击时机需要非常谨慎。
 * - 内部包裹的实际题目内容由 `ComponentRender` 提供，本组件不关心具体题型细节。
 * 关键问题：在不破坏原有“点击选中”行为的前提下，把拖拽手柄局部化，并避免拖拽起手/释放时误触发选中。
 * 阅读建议：先看 props 中 `shouldIgnoreClick` 的用途，再看 `handleClick` 和 `handleDragHandleClick` 如何一起兜住选中与拖拽的边界。
 */
import React from 'react'
import clsx from 'clsx'
import { useSelector, useDispatch } from 'react-redux'
import { RootState } from '@/store'
import { setSelectedId } from '@/store/modules/componentsSlice'
import { MenuOutlined } from '@ant-design/icons'
import { Tooltip } from 'antd'

type DragHandleProps = React.HTMLAttributes<HTMLDivElement>

type ComponentWapperProps = {
  children: React.ReactNode
  fe_id: string
  dragHandleProps?: DragHandleProps
  dragHandleRef?: (node: HTMLDivElement | null) => void
  isDragging?: boolean
  // 由 EditCanvas 在拖拽会话中传入，用来屏蔽释放鼠标时那次“迟到的 click”。
  shouldIgnoreClick?: () => boolean
}

// 包装单个题目组件，把“选中”和“拖拽入口”这两套交互汇聚到同一张卡片上。
const ComponentWapper: React.FC<ComponentWapperProps> = ({
  children,
  fe_id,
  dragHandleProps,
  dragHandleRef,
  shouldIgnoreClick,
  isDragging = false
}) => {
  const selectedId = useSelector((state: RootState) => state.components.selectedId)
  const dispatch = useDispatch()

  // 处理题目卡片点击，并把结果同步到 Redux 的 selectedId。
  // 这里要先检查 shouldIgnoreClick，因为 setSelectedId 会写历史记录，拖拽过程中的误点击会污染撤销/重做链路。
  const handleClick = () => {
    if (shouldIgnoreClick?.()) {
      return
    }

    if (selectedId === fe_id) {
      // 维持编辑器原有的“再次点击已选中题目则取消选中”行为，避免拖拽改造后交互语义悄悄改变。
      dispatch(setSelectedId(''))
    } else {
      dispatch(setSelectedId(fe_id))
    }
  }

  // 处理拖拽手柄点击，显式切断事件冒泡。
  // 如果手柄点击继续冒泡到卡片容器，用户一次“按下准备拖拽”的动作会先触发选中，再触发拖拽，交互会显得很黏。
  const handleDragHandleClick: React.MouseEventHandler<HTMLDivElement> = event => {
    event.preventDefault()
    event.stopPropagation()
    dragHandleProps?.onClick?.(event)
  }

  return (
    <div
      className={clsx(
        'group p-4 bg-white rounded-lg mb-4 border border-transparent hover:border-custom-primary-100 relative shadow-sm hover:shadow',
        selectedId === fe_id && '!border-custom-primary-100 shadow-md',
        isDragging &&
          'border-dashed border-custom-primary-100 shadow-xl ring-1 ring-custom-primary-100/40'
      )}
      onClick={handleClick}
    >
      {/* 拖拽手柄 - 使用自定义事件监听，确保拖拽可以触发 */}
      <Tooltip title="拖拽排序" placement="top" mouseEnterDelay={0.5}>
        <div
          ref={dragHandleRef}
          {...dragHandleProps}
          onClick={handleDragHandleClick}
          className={clsx(
            dragHandleProps?.className,
            'absolute right-0 top-0 h-8 px-2.5 flex items-center justify-center bg-custom-bg-100 text-custom-text-200 cursor-grab active:cursor-grabbing rounded-bl-lg rounded-tr-md opacity-0 group-hover:opacity-100',
            selectedId === fe_id && 'opacity-100 bg-custom-primary-100 text-white',
            isDragging &&
              'opacity-100 cursor-grabbing bg-custom-primary-100 text-white shadow-inner'
          )}
          style={{
            ...dragHandleProps?.style,
            // 关闭浏览器默认的触摸滚动手势，让 PointerSensor 能尽早接管拖拽。
            touchAction: 'none',
            cursor: isDragging ? 'grabbing' : 'grab'
          }}
        >
          <MenuOutlined className="text-[14px]" />
        </div>
      </Tooltip>

      {/* 选中标识只在正常卡片上展示；拖拽预览里去掉它可以减少“当前到底选中了谁”的视觉干扰。 */}
      {selectedId === fe_id && !isDragging && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-custom-primary-100 rounded-l-lg shadow-[1px_0_4px_rgba(38,166,154,0.3)]"></div>
      )}

      {/* 正文内容保持透传，Wrapper 只负责外壳交互，不介入题型内部渲染。 */}
      <div className={clsx(isDragging && 'opacity-95')}>{children}</div>
    </div>
  )
}

export default ComponentWapper
