/**
 * 核心职责：为拖拽排序模型提供回归测试，确认提示线判定和目标索引换算在体验优化后仍然保持语义稳定。
 * 所属层次：测试验证层。它不参与运行时逻辑，但负责兜住这次 dnd-kit 迁移里最容易反复回归的几何判定。
 * 模块关系：
 * - 直接验证 `sortableCanvasModel` 的纯函数行为。
 * - 间接保护 `EditCanvas` 的 `handleDragOver / handleDragEnd`，因为这两个主流程依赖这里的返回值驱动画布提示线和 Redux 重排。
 * 关键问题：拖拽体验优化通常靠调阈值和缓冲区，若没有测试，后续很容易在“变顺手”时把 before/after 语义悄悄改坏。
 * 阅读建议：先看“same-position / before-after 语义”这类基础测试，再看“pointer buffer”相关场景，它们对应这次体验优化的核心风险点。
 */
import {
  getDestinationIndex,
  getIndexById,
  resolveDragIndicator
} from '@/pages/question/Edit/sortableCanvasModel'
import { type ComponentInfoType } from '@/store/modules/componentsSlice'

const componentList: ComponentInfoType[] = [
  {
    fe_id: 'q1',
    type: 'input',
    title: 'Q1',
    props: {}
  },
  {
    fe_id: 'q2',
    type: 'input',
    title: 'Q2',
    props: {}
  },
  {
    fe_id: 'q3',
    type: 'input',
    title: 'Q3',
    props: {}
  }
]

// 用最小组件结构构造排序场景，聚焦验证模型本身，避免测试受题型细节影响。
// 覆盖排序模型的核心分支，确保不同拖拽路径下都能得到稳定的落点结果。
describe('sortableCanvasModel', () => {
  it('keeps same-position drops as no-op destinations', () => {
    expect(getDestinationIndex(1, { index: 1, position: 'before' }, componentList.length)).toBe(1)
    expect(getDestinationIndex(1, { index: 1, position: 'after' }, componentList.length)).toBe(1)
  })

  it('maps before/after indicators to the same destination semantics as the native implementation', () => {
    expect(getDestinationIndex(0, { index: 2, position: 'after' }, componentList.length)).toBe(2)
    expect(getDestinationIndex(2, { index: 0, position: 'before' }, componentList.length)).toBe(0)
    expect(getDestinationIndex(1, { index: 2, position: 'before' }, componentList.length)).toBe(1)
  })

  it('falls back to list direction when no drag rectangles are available', () => {
    expect(resolveDragIndicator('q1', 'q3', componentList)).toEqual({
      index: 2,
      position: 'after'
    })
    expect(resolveDragIndicator('q3', 'q1', componentList)).toEqual({
      index: 0,
      position: 'before'
    })
  })

  it('uses translated center points to resolve before and after insertion', () => {
    expect(
      resolveDragIndicator('q1', 'q2', componentList, {
        activeRect: { top: 10, height: 20 },
        overRect: { top: 80, height: 40 }
      })
    ).toEqual({
      index: 1,
      position: 'before'
    })

    expect(
      resolveDragIndicator('q1', 'q2', componentList, {
        activeRect: { top: 130, height: 20 },
        overRect: { top: 80, height: 40 }
      })
    ).toEqual({
      index: 1,
      position: 'after'
    })
  })

  it('uses pointer position near the card edges to make drop placement more predictable', () => {
    expect(
      resolveDragIndicator('q1', 'q2', componentList, {
        activeRect: { top: 10, height: 20 },
        overRect: { top: 80, height: 100 },
        pointerY: 90
      })
    ).toEqual({
      index: 1,
      position: 'before'
    })

    expect(
      resolveDragIndicator('q1', 'q2', componentList, {
        activeRect: { top: 10, height: 20 },
        overRect: { top: 80, height: 100 },
        pointerY: 160
      })
    ).toEqual({
      index: 1,
      position: 'after'
    })
  })

  it('keeps the previous position while the pointer stays in the target midpoint buffer', () => {
    expect(
      resolveDragIndicator('q1', 'q2', componentList, {
        activeRect: { top: 10, height: 20 },
        overRect: { top: 80, height: 100 },
        pointerY: 130,
        previousIndicator: { index: 1, position: 'before' }
      })
    ).toEqual({
      index: 1,
      position: 'before'
    })

    expect(
      resolveDragIndicator('q1', 'q2', componentList, {
        activeRect: { top: 10, height: 20 },
        overRect: { top: 80, height: 100 },
        pointerY: 130,
        previousIndicator: { index: 1, position: 'after' }
      })
    ).toEqual({
      index: 1,
      position: 'after'
    })
  })

  it('returns sentinel values for missing ids', () => {
    expect(getIndexById(componentList, null)).toBe(-1)
    expect(resolveDragIndicator('q1', 'missing', componentList)).toBeNull()
  })
})
