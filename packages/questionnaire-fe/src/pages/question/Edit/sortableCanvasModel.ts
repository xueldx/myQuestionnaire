/**
 * 核心职责：把 dnd-kit 提供的 active/over/rect/pointer 信息翻译成编辑器真正关心的“提示线位置”和“最终目标索引”。
 * 所属层次：工具函数层。这里刻意不依赖 React，也不直接写 Redux，方便把拖拽判定从界面渲染中剥离出来单测覆盖。
 * 模块关系：
 * - 被 `EditCanvas` 的 `handleDragOver / handleDragEnd` 调用，负责解释拖拽过程中的几何信息。
 * - 其输出 `DragIndicator` 会先驱动画布提示线，再由 `getDestinationIndex` 换算成 `reorderComponents` 所需的索引。
 * - 被 `sortableCanvasModel.spec` 覆盖关键边界，保证拖拽体验优化不会悄悄破坏排序语义。
 * 关键问题：dnd-kit 给的是几何和碰撞结果，但编辑器真正需要的是“应该显示在哪一条提示线”和“最后该把题目插到哪”。
 * 设计意图：把复杂的拖拽判定留在纯函数里，而不是塞进组件状态里，未来调阈值、修抖动或补边界时风险更可控。
 * 阅读建议：先看 `resolveDragIndicator` 如何决定 before/after，再看 `getDestinationIndex` 如何把提示线结果折算成最终索引。
 */
import { type ComponentInfoType } from '@/store/modules/componentsSlice'

// 画布层使用的“插入提示线”语义；它描述的是目标题目的前/后，而不是最终数组索引。
export type DragIndicator = {
  index: number
  position: 'before' | 'after'
} | null

// 只保留排序计算真正关心的纵向几何字段，避免 helper 与具体 DOMRect 类型强耦合。
export type VerticalRect = {
  top: number
  height: number
}

// 解析提示线时的附加上下文；这些值都来自 EditCanvas 的拖拽会话，而不是 Redux 持久状态。
type ResolveDragIndicatorOptions = {
  activeRect?: VerticalRect | null
  overRect?: VerticalRect | null
  pointerY?: number | null
  previousIndicator?: DragIndicator
}

export const getDestinationIndex = (
  sourceIndex: number,
  indicator: DragIndicator,
  listLength: number
) => {
  // 把 before/after 插入指示线换算成最终列表落点索引。
  // 这个函数是 EditCanvas 与 Redux reducer 之间的“语义转换层”：UI 关心提示线，store 只关心数组索引。
  if (!indicator || sourceIndex < 0 || sourceIndex >= listLength) return null

  const insertionIndex = indicator.position === 'before' ? indicator.index : indicator.index + 1
  // 向下拖动时，源项会先从数组里移除一次，因此插入点需要回退 1 位；这是排序实现里最容易改错的地方。
  const destinationIndex = sourceIndex < insertionIndex ? insertionIndex - 1 : insertionIndex

  return Math.min(Math.max(destinationIndex, 0), listLength - 1)
}

// 根据题目 fe_id 定位其在当前组件列表中的索引；给 model 层统一提供“id -> index”映射入口。
export const getIndexById = (componentList: ComponentInfoType[], id: string | null) => {
  if (!id) return -1
  return componentList.findIndex(component => component.fe_id === id)
}

// 根据活动项、目标项和指针位置解析当前应该显示的 before/after 插入指示线。
// 这是拖拽体验的核心判定：提示线稳不稳、用户是否容易找到落点，主要取决于这里的分支策略。
export const resolveDragIndicator = (
  activeId: string,
  overId: string,
  componentList: ComponentInfoType[],
  { activeRect, overRect, pointerY, previousIndicator }: ResolveDragIndicatorOptions = {}
): DragIndicator => {
  const sourceIndex = getIndexById(componentList, activeId)
  const overIndex = getIndexById(componentList, overId)

  // 只要 active 或 over 已经无法映射回当前列表，就说明这轮 drag 信息不再可靠，宁可返回 null 也不要猜测落点。
  if (sourceIndex < 0 || overIndex < 0) {
    return null
  }

  // 当拿不到几何信息时，退回到“列表相对方向”这个最朴素的判断。
  // 这保证了首帧、边界帧或未来非指针拖拽场景下，仍能得到一个可用但不激进的默认结果。
  const fallbackPosition: Exclude<DragIndicator, null>['position'] =
    sourceIndex < overIndex ? 'after' : 'before'

  if (!activeRect || !overRect) {
    return {
      index: overIndex,
      position: fallbackPosition
    }
  }

  if (pointerY != null) {
    const pointerOffsetY = pointerY - overRect.top
    const upperThreshold = overRect.height * 0.35
    const lowerThreshold = overRect.height * 0.65

    // 顶部 35% 和底部 35% 直接决定落点，中间 30% 留作缓冲区。
    // 这里故意不用 50/50 平分，因为高卡片在接近中心时太容易来回翻转，用户会觉得“放不稳”。
    if (pointerOffsetY <= upperThreshold) {
      return {
        index: overIndex,
        position: 'before'
      }
    }

    if (pointerOffsetY >= lowerThreshold) {
      return {
        index: overIndex,
        position: 'after'
      }
    }

    // 指针停在同一题目的中间缓冲区时沿用上一次结果。
    // 注意这里只在 overIndex 不变时复用，跨到另一题后必须重新计算，否则提示线会“黏住”上一项。
    if (previousIndicator?.index === overIndex) {
      return {
        index: overIndex,
        position: previousIndicator.position
      }
    }
  }

  // 如果没有 pointer 信息，或指针缓冲区不足以给出稳定结果，就回退到中心点比较。
  // 这层兜底保持了模型的连续性，避免调用方为了极端场景再额外写一套判定。
  const activeCenterY = activeRect.top + activeRect.height / 2
  const overCenterY = overRect.top + overRect.height / 2

  return {
    index: overIndex,
    position: activeCenterY < overCenterY ? 'before' : 'after'
  }
}
