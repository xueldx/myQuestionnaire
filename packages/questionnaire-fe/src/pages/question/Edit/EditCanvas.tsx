/**
 * 核心职责：承接问卷编辑页中的“题目拖拽排序”主流程，把 dnd-kit 的拖拽事件转换成画布提示线、拖拽预览和最终的 Redux 顺序更新。
 * 所属层次：UI 展示层 + 逻辑编排层。这里既负责渲染画布，也负责把拖拽会话中的临时状态组织起来。
 * 模块关系：
 * - 依赖 `ComponentWapper` / `ComponentRender` 渲染单个题目卡片和拖拽预览。
 * - 依赖 `sortableCanvasModel` 把 active/over/pointer 信息换算成 before/after 指示线与目标索引。
 * - 依赖 `componentsSlice.reorderComponents` 把最终排序结果写回 Redux；排序真正落库只发生在 `handleDragEnd`。
 * - 依赖 `useScrollToSelected` 维持原有“选中题目后滚动定位”的行为，不因拖拽改造而退化。
 * 关键问题：既要迁移到 dnd-kit，又要保持原有 Redux 数据流、历史记录和选中行为稳定，同时修正长卡片拖拽时的漂移与跳动问题。
 * 阅读建议：先看状态分组与 `handleDragStart / handleDragOver / handleDragEnd` 主流程，再看 `collisionDetectionStrategy`
 * 和 `keepOverlayAlignedToSourceColumn` 这两个“为什么拖得稳、放得准”的关键实现。
 */
import React, { useEffect, useRef, useState } from 'react'
import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type Modifier
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import ComponentWapper from '@/pages/question/Edit/components/ComponentWapper'
import ComponentRender from '@/pages/question/Edit/components/ComponentRender'
import { useSelector, useDispatch } from 'react-redux'
import { RootState } from '@/store'
import useScrollToSelected from '@/pages/question/Edit/hooks/useScrollToSelected'
import { Typography, App } from 'antd'
import { reorderComponents, type ComponentInfoType } from '@/store/modules/componentsSlice'
import {
  getDestinationIndex,
  getIndexById,
  resolveDragIndicator,
  type DragIndicator
} from '@/pages/question/Edit/sortableCanvasModel'
import DevTools from '@/components/DevTools'
import clsx from 'clsx'

const { Title, Paragraph } = Typography

// 本地调试开关，默认关闭；保留它是为了排查拖拽体验问题时能快速打开辅助提示。
const TEST_MODE = false

type SortableCanvasItemProps = {
  component: ComponentInfoType
  activeId: string | null
  setScrollRef: (element: HTMLDivElement | null) => void
  showBeforeIndicator: boolean
  showAfterIndicator: boolean
  shouldIgnoreClick: () => boolean
}

type DragOverlayPreviewProps = {
  component: ComponentInfoType
  width: number | null
}

// 只保存拖拽会话中的高频瞬时数据；这些值只参与计算，不直接驱动渲染，所以放在 ref 里比 state 更合适。
type DragPointerState = {
  currentClientY: number
  offsetY: number
  sourceLeft: number
}

// 提取鼠标或触摸事件中的视口坐标，用于计算拖拽预览与指针的锚点关系。
const getEventClientPoint = (event: Event | null | undefined) => {
  if (!event) {
    return null
  }

  if ('touches' in event && event.touches.length > 0) {
    return {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY
    }
  }

  if ('changedTouches' in event && event.changedTouches.length > 0) {
    return {
      x: event.changedTouches[0].clientX,
      y: event.changedTouches[0].clientY
    }
  }

  if ('clientX' in event && 'clientY' in event) {
    return {
      x: event.clientX,
      y: event.clientY
    }
  }

  return null
}

// 强制拖拽手势只沿纵向移动。
// 这层先约束 dnd-kit 的基础坐标系，后面的 overlay modifier 再补充“贴住源列和按下点”的细节对齐。
const restrictToVerticalAxis: Modifier = ({ transform }) => {
  return {
    ...transform,
    x: 0
  }
}

const SortableCanvasItem: React.FC<SortableCanvasItemProps> = ({
  component,
  activeId,
  setScrollRef,
  showBeforeIndicator,
  showAfterIndicator,
  shouldIgnoreClick
}) => {
  // 为单个题目卡片接入排序能力，同时把“拖拽入口只在手柄上”这个约束落到具体 DOM 节点。
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, isDragging } = useSortable({
    id: component.fe_id
  })

  // 同时注册排序节点和选中态滚动节点，保证拖拽改造不会影响原来的“选中后滚动到可见区域”链路。
  const handleNodeRef = (node: HTMLDivElement | null) => {
    setNodeRef(node)
    setScrollRef(node)
  }

  // 只把 dnd-kit 的属性和事件绑到手柄，而不是整张卡片，避免点击正文区域时误进入拖拽。
  const dragHandleProps = {
    ...(attributes ?? {}),
    ...(listeners ?? {})
  } as React.HTMLAttributes<HTMLDivElement>

  const isActiveSource = activeId === component.fe_id
  const sortableStyle: React.CSSProperties | undefined = isActiveSource
    ? {
        // 源卡片在原位保留不可见占位。
        // 这样列表高度和其它题目的相对位置在拖拽过程中保持稳定，用户依赖的是提示线而不是“被挤开的空洞”。
        visibility: 'hidden',
        pointerEvents: 'none'
      }
    : undefined

  return (
    <React.Fragment key={component.fe_id}>
      <div
        className={clsx(
          'h-0.5 mx-2 my-1 rounded-full transition-all duration-150',
          showBeforeIndicator ? 'bg-custom-primary-100 opacity-100 scale-y-150' : 'opacity-0'
        )}
      />

      <div
        ref={handleNodeRef}
        data-draggable-root="true"
        data-sortable-id={component.fe_id}
        className="mb-3"
        style={sortableStyle}
      >
        <ComponentWapper
          fe_id={component.fe_id}
          dragHandleProps={dragHandleProps}
          dragHandleRef={setActivatorNodeRef}
          isDragging={isDragging}
          shouldIgnoreClick={shouldIgnoreClick}
        >
          <ComponentRender component={component} />
        </ComponentWapper>
      </div>

      <div
        className={clsx(
          'h-0.5 mx-2 my-1 rounded-full transition-all duration-150',
          showAfterIndicator ? 'bg-custom-primary-100 opacity-100 scale-y-150' : 'opacity-0'
        )}
      />
    </React.Fragment>
  )
}

// 渲染跟手的拖拽预览卡片，复用正式题目卡片的视觉结构，避免“拖起来和落下去不是同一个东西”的认知割裂。
const DragOverlayPreview: React.FC<DragOverlayPreviewProps> = ({ component, width }) => {
  return (
    <div
      className="pointer-events-none"
      style={{
        // 锁定源卡片宽度，避免 overlay 因所在容器宽度或内容重算出现二次变形。
        width: width ?? undefined,
        // overlay 每帧都在变换位置，提前声明可以减少拖拽时的重绘抖动。
        willChange: 'transform'
      }}
    >
      {/* overlay 只是视觉预览，不应该参与选中逻辑，因此 click 始终被屏蔽。 */}
      <ComponentWapper fe_id={component.fe_id} isDragging shouldIgnoreClick={() => true}>
        <ComponentRender component={component} />
      </ComponentWapper>
    </div>
  )
}

// 管理编辑画布中的拖拽排序、落点提示、选中态抑制和排序结果提交。
const EditCanvas: React.FC = () => {
  const { message } = App.useApp()
  const componentList = useSelector((state: RootState) => state.components.componentList)
  const pageConfig = useSelector((state: RootState) => state.pageConfig)
  const { getRef } = useScrollToSelected()
  const dispatch = useDispatch()
  // 这些 state 会直接影响渲染：当前活动项、overlay 尺寸和插入提示线都需要让 React 重新绘制。
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activePreviewWidth, setActivePreviewWidth] = useState<number | null>(null)
  const [dragIndicator, setDragIndicator] = useState<DragIndicator>(null)
  // 这些 ref 只服务于拖拽会话内部的高频计算，刻意不用 state，避免 pointermove/dragover 期间频繁重渲染。
  const suppressSelectionRef = useRef(false)
  const suppressSelectionTimeoutRef = useRef<number | null>(null)
  const dragPointerStateRef = useRef<DragPointerState | null>(null)
  const lastOverIdRef = useRef<string | null>(null)
  // 不设置 activationConstraint，目的是让手柄按下后立即进入拖拽，避免用户先拖一小段才“激活”的滞后感。
  const sensors = useSensors(useSensor(PointerSensor))
  const isDragging = activeId !== null
  const activeComponent = componentList.find(component => component.fe_id === activeId) ?? null
  // 决定“当前鼠标算落在哪个题目上”的碰撞策略。
  // 这里没有直接依赖默认的 closestCenter，是因为长卡片和卡片间隙会让目标项切换过于频繁，用户很难稳定找到落点。
  const collisionDetectionStrategy: CollisionDetection = args => {
    const pointerCollisions = pointerWithin(args)

    if (pointerCollisions.length > 0) {
      // 指针真实落在某个题目范围内时，优先信任这个结果，它比“距离中心点最近”更符合用户直觉。
      lastOverIdRef.current = String(pointerCollisions[0].id)
      return pointerCollisions
    }

    if (lastOverIdRef.current) {
      // 指针短暂经过题目间隙时，继续沿用上一帧的 over 结果。
      // 这层缓冲能避免 overId 在 null 和目标题目之间来回跳，进而减少提示线和周围元素抖动。
      const lastOverContainer = args.droppableContainers.find(
        container => String(container.id) === lastOverIdRef.current
      )

      if (lastOverContainer) {
        return [
          {
            id: lastOverContainer.id,
            data: {
              droppableContainer: lastOverContainer,
              value: 1
            }
          }
        ]
      }
    }

    const fallbackCollisions = closestCenter(args)

    if (fallbackCollisions.length > 0) {
      // 只有在完全拿不到 pointer 命中信息时，才回退到距离中心点最近的策略，兼容边界场景和未来非指针输入。
      lastOverIdRef.current = String(fallbackCollisions[0].id)
    }

    return fallbackCollisions
  }
  // 计算拖拽预览块的最终位置，让它既跟手又保持原卡片所在列不发生横向漂移。
  const keepOverlayAlignedToSourceColumn: Modifier = ({
    activeNodeRect,
    overlayNodeRect,
    transform
  }) => {
    if (!overlayNodeRect) {
      return {
        ...transform,
        x: 0
      }
    }

    const dragPointerState = dragPointerStateRef.current

    if (dragPointerState) {
      return {
        ...transform,
        // x 永远对齐到源卡片左边界，明确告诉用户这是“同一列里上下移动”的排序动作。
        x: dragPointerState.sourceLeft - overlayNodeRect.left,
        // 直接按当前指针位置减去起手偏移计算 y，减少“拖一段才跟上”的观感。
        y: dragPointerState.currentClientY - dragPointerState.offsetY - overlayNodeRect.top
      }
    }

    if (!activeNodeRect) {
      return {
        ...transform,
        x: 0
      }
    }

    return {
      ...transform,
      // 兜底分支仍保留原有 rect 对齐逻辑，避免极端情况下因拿不到指针锚点而完全失去 overlay 定位能力。
      x: activeNodeRect.left - overlayNodeRect.left,
      y: transform.y + (activeNodeRect.top - overlayNodeRect.top)
    }
  }

  // 管理拖拽会话期间的全局页面反馈。
  // 这些样式不适合散落在组件节点上，因为 overlay、列表项和正文都会受影响，统一挂到 body 更容易保证一致。
  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = `
      body.dragging {
        cursor: grabbing !important;
      }
      body.dragging * {
        user-select: none;
      }
    `
    document.head.appendChild(style)

    return () => {
      if (suppressSelectionTimeoutRef.current !== null) {
        window.clearTimeout(suppressSelectionTimeoutRef.current)
      }
      suppressSelectionRef.current = false
      document.body.classList.remove('dragging')
      document.head.removeChild(style)
    }
  }, [])

  // 在拖拽期间持续记录全局指针位置。
  // 这里用原生事件直接写 ref，而不是用 React state 追踪，是为了避免每次指针移动都触发组件重渲染。
  useEffect(() => {
    // 同步最新指针 y 坐标，让 overlay 位置和落点缓冲区都基于真实手势而不是估算值。
    const handlePointerMove = (event: PointerEvent) => {
      if (!dragPointerStateRef.current) {
        return
      }

      dragPointerStateRef.current.currentClientY = event.clientY
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true })

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
    }
  }, [])

  // 在拖拽结束后的下一个事件循环再恢复点击。
  // 释放鼠标时浏览器仍可能补发 click；如果同步解锁，drag handle 的一次拖拽会被误判成卡片点击并写入多余历史记录。
  const scheduleSelectionUnlock = () => {
    if (suppressSelectionTimeoutRef.current !== null) {
      window.clearTimeout(suppressSelectionTimeoutRef.current)
    }

    suppressSelectionTimeoutRef.current = window.setTimeout(() => {
      suppressSelectionRef.current = false
      suppressSelectionTimeoutRef.current = null
    }, 0)
  }

  // 清理当前拖拽会话中的 overlay、指针锚点和交互抑制状态。
  // 无论最终有没有发生排序，这些状态都应该先复位，避免 Redux 更新触发重新渲染时遗留拖拽中的视觉状态。
  const clearDragState = () => {
    setActiveId(null)
    setActivePreviewWidth(null)
    setDragIndicator(null)
    dragPointerStateRef.current = null
    lastOverIdRef.current = null
    document.body.classList.remove('dragging')
    scheduleSelectionUnlock()
  }

  // 开始一轮新的拖拽会话：锁定活动项、记录预览尺寸，并建立“指针 -> overlay”对齐所需的锚点数据。
  const handleDragStart = (event: DragStartEvent) => {
    if (suppressSelectionTimeoutRef.current !== null) {
      window.clearTimeout(suppressSelectionTimeoutRef.current)
      suppressSelectionTimeoutRef.current = null
    }

    suppressSelectionRef.current = true
    setActiveId(String(event.active.id))
    setActivePreviewWidth(event.active.rect.current.initial?.width ?? null)
    setDragIndicator(null)
    lastOverIdRef.current = null
    const initialRect = event.active.rect.current.initial
    const pointerPoint = getEventClientPoint(event.activatorEvent)

    if (initialRect) {
      // activatorEvent 在极少数场景下可能拿不到，回退到卡片中心点至少能保证 overlay 不会瞬移到异常位置。
      const fallbackPointerY = initialRect.top + initialRect.height / 2
      const nextPointerY = pointerPoint?.y ?? fallbackPointerY
      const offsetY = Math.min(Math.max(nextPointerY - initialRect.top, 0), initialRect.height)

      // 保存“按下点到卡片顶部”的距离，让预览块移动时始终贴住起手位置。
      dragPointerStateRef.current = {
        currentClientY: nextPointerY,
        offsetY,
        sourceLeft: initialRect.left
      }
    } else {
      dragPointerStateRef.current = null
    }

    document.body.classList.add('dragging')
  }

  // 在拖拽经过目标项时更新插入提示线。
  // 这一层只维护本地 UI 提示，不直接改 Redux 顺序；真正的列表重排仍延迟到拖拽结束时再提交。
  const handleDragOver = (event: DragOverEvent) => {
    const currentActiveId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : null

    if (!overId) {
      setDragIndicator(null)
      return
    }

    setDragIndicator(currentIndicator => {
      // 使用函数式 setState 是为了拿到当前最新的提示线结果。
      // 这样模型层才能在“同一张题目中间区域”复用上一帧结果，避免快速 dragover 时读到过期闭包。
      // 中间缓冲区会沿用上一次 before/after 结果，避免指针轻微抖动导致落点频繁翻转。
      const nextIndicator = resolveDragIndicator(currentActiveId, overId, componentList, {
        // 优先使用 translated rect，让模型看到的是“当前帧位置”而不是拖拽开始位置。
        activeRect: event.active.rect.current.translated ?? event.active.rect.current.initial,
        overRect: event.over.rect,
        pointerY: dragPointerStateRef.current?.currentClientY ?? null,
        previousIndicator: currentIndicator
      })

      if (
        currentIndicator?.index === nextIndicator?.index &&
        currentIndicator?.position === nextIndicator?.position
      ) {
        return currentIndicator
      }

      return nextIndicator
    })
  }

  // 在拖拽结束时把当前指示线换算成 Redux 所需的目标索引，并通过 reducer 一次性提交排序结果。
  const handleDragEnd = (event: DragEndEvent) => {
    const currentActiveId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : null
    const sourceIndex = getIndexById(componentList, currentActiveId)
    const nextIndicator =
      overId === null
        ? null
        : resolveDragIndicator(currentActiveId, overId, componentList, {
            // 结束时仍沿用和 dragover 相同的几何来源，避免提示线和最终落点出现两套判定标准。
            activeRect: event.active.rect.current.translated ?? event.active.rect.current.initial,
            overRect: event.over.rect,
            pointerY: dragPointerStateRef.current?.currentClientY ?? null,
            previousIndicator: dragIndicator
          })

    // 先清本地拖拽态，再决定是否 dispatch。
    // 如果先 dispatch，列表重新渲染时可能短暂带着旧 overlay/提示线状态，视觉上会更“脏”。
    clearDragState()

    if (sourceIndex < 0) {
      return
    }

    const destinationIndex = getDestinationIndex(sourceIndex, nextIndicator, componentList.length)
    if (destinationIndex === null || destinationIndex === sourceIndex) {
      return
    }

    // 只在最终落点确定后 dispatch 一次。
    // reorderComponents 会进入 Redux 历史记录，因此不能在拖拽过程中高频写入，否则撤销/重做会变得不可用。
    dispatch(
      reorderComponents({
        sourceIndex,
        destinationIndex
      })
    )
    message.success('组件顺序已更新', 0.5)
  }

  // 在拖拽被取消时只回收会话状态，明确不触发任何排序写回。
  const handleDragCancel = () => {
    clearDragState()
  }

  // 判断某个题目上方或下方的插入提示线是否应该显示。
  // 这里还会过滤“看起来有提示线，但实际 destinationIndex 没变化”的情况，避免用户误以为发生了排序。
  const isIndicatorVisible = (index: number, position: 'before' | 'after') => {
    if (!dragIndicator || dragIndicator.index !== index || dragIndicator.position !== position) {
      return false
    }

    const sourceIndex = getIndexById(componentList, activeId)
    if (sourceIndex < 0) {
      return false
    }

    return getDestinationIndex(sourceIndex, dragIndicator, componentList.length) !== sourceIndex
  }

  // 告诉下层卡片：当前 drag 会话尚未完全结束前，不要响应 click 选中逻辑。
  const shouldIgnoreComponentClick = () => suppressSelectionRef.current

  const canvasStyle = {
    height: '100%',
    display: 'flex',
    flexDirection: 'column' as const
  }

  return (
    <div
      className={`h-full overflow-y-scroll custom-no-scrollbar ${
        isDragging ? 'bg-custom-bg-100' : ''
      }`}
      style={canvasStyle}
    >
      {/* 调试工具 */}
      <DevTools />

      {/* 问卷头部 */}
      <div className="pt-4 px-4 pb-2">
        <Title
          level={3}
          style={{
            color: 'rgb(38, 166, 154)',
            textAlign: 'center',
            marginBottom: '8px'
          }}
        >
          {pageConfig.title}
        </Title>

        <Paragraph
          style={{
            textAlign: 'center',
            fontSize: '14px',
            marginBottom: '16px',
            color: 'rgb(114, 143, 158)'
          }}
        >
          {pageConfig.description}
        </Paragraph>
      </div>

      {TEST_MODE && (
        <div className="my-2 p-2 text-center text-sm bg-custom-bg-200 text-custom-text-100 rounded">
          <b>拖拽调试模式已开启</b> - 请尝试拖拽组件调整顺序
        </div>
      )}

      <div className="flex-1 px-4">
        {componentList.length > 0 ? (
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetectionStrategy}
            modifiers={[restrictToVerticalAxis]}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            {/* SortableContext 只声明当前画布中的题目顺序和排序策略。
                真正的 Redux 顺序更新仍由 handleDragEnd 统一提交，这样能保住原有历史记录和成功提示时机。 */}
            <SortableContext
              items={componentList.map(component => component.fe_id)}
              strategy={verticalListSortingStrategy}
            >
              <div
                className={clsx(
                  'rounded-lg transition-all duration-300 bg-custom-bg-100 border border-custom-bg-200',
                  isDragging && 'shadow-inner ring-1 ring-custom-primary-100'
                )}
                style={{ minHeight: '100px', padding: '8px' }}
              >
                {componentList.length > 1 && (
                  <div className="text-xs text-center py-2 text-custom-text-200 mb-2 bg-custom-bg-200 rounded font-medium">
                    {isDragging ? '↕️ 请拖放到目标位置...' : '↕️ 可通过拖拽组件调整顺序'}
                  </div>
                )}

                {componentList.map((component, index) => (
                  <SortableCanvasItem
                    key={component.fe_id}
                    component={component}
                    activeId={activeId}
                    setScrollRef={getRef(component.fe_id)}
                    showBeforeIndicator={isIndicatorVisible(index, 'before')}
                    showAfterIndicator={isIndicatorVisible(index, 'after')}
                    shouldIgnoreClick={shouldIgnoreComponentClick}
                  />
                ))}
              </div>
            </SortableContext>

            {/* overlay 是“视觉上的被拖拽卡片”，真实列表项仍留在原位做占位。
                这种做法比让兄弟项跟着 transform 挤位更稳定，尤其适合题目高度差异很大的问卷编辑器。 */}
            <DragOverlay adjustScale={false} modifiers={[keepOverlayAlignedToSourceColumn]}>
              {activeComponent ? (
                <DragOverlayPreview component={activeComponent} width={activePreviewWidth} />
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : (
          <div className="flex flex-col items-center justify-center h-[200px] text-custom-text-200 text-center border-2 border-dashed border-custom-bg-200 rounded-lg bg-custom-bg-100 p-6">
            <div className="text-lg mb-2">问卷内容为空</div>
            <div className="text-sm mb-4">请从左侧列表添加组件，或从其他问卷复制</div>
          </div>
        )}
      </div>

      {/* 问卷页脚 */}
      {pageConfig.footerText && (
        <div className="py-3 text-center text-sm text-custom-text-200">{pageConfig.footerText}</div>
      )}
    </div>
  )
}

export default EditCanvas
