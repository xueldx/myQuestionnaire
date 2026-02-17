import React, { useEffect, useState } from 'react'
import ComponentWapper from '@/pages/question/Edit/components/ComponentWapper'
import ComponentRender from '@/pages/question/Edit/components/ComponentRender'
import { useSelector, useDispatch } from 'react-redux'
import { RootState } from '@/store'
import useScrollToSelected from '@/pages/question/Edit/hooks/useScrollToSelected'
import { Typography, App } from 'antd'
import { reorderComponents } from '@/store/modules/componentsSlice'
import DevTools from '@/components/DevTools'
import clsx from 'clsx'

const { Title, Paragraph } = Typography

// 添加用于测试的内联样式，确保拖拽区域明显可见
const TEST_MODE = false
type DragIndicator = {
  index: number
  position: 'before' | 'after'
} | null

const getDestinationIndex = (sourceIndex: number, indicator: DragIndicator, listLength: number) => {
  if (!indicator || sourceIndex < 0 || sourceIndex >= listLength) return null

  const insertionIndex = indicator.position === 'before' ? indicator.index : indicator.index + 1
  const destinationIndex = sourceIndex < insertionIndex ? insertionIndex - 1 : insertionIndex

  return Math.min(Math.max(destinationIndex, 0), listLength - 1)
}

const EditCanvas: React.FC = () => {
  const { message } = App.useApp()
  const componentList = useSelector((state: RootState) => state.components.componentList)
  const pageConfig = useSelector((state: RootState) => state.pageConfig)
  const { getRef } = useScrollToSelected()
  const dispatch = useDispatch()
  const [isDragging, setIsDragging] = useState(false)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [dragIndicator, setDragIndicator] = useState<DragIndicator>(null)

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
      document.body.classList.remove('dragging')
      document.head.removeChild(style)
    }
  }, [])

  const clearDragState = () => {
    setIsDragging(false)
    setDraggingIndex(null)
    setDragIndicator(null)
    document.body.classList.remove('dragging')
  }

  const handleNativeDragStart = (event: React.DragEvent<HTMLDivElement>, index: number) => {
    event.stopPropagation()
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))

    const dragPreview = event.currentTarget.closest('[data-draggable-root="true"]')
    if (dragPreview instanceof HTMLElement) {
      event.dataTransfer.setDragImage(dragPreview, 24, 24)
    }

    setIsDragging(true)
    setDraggingIndex(index)
    setDragIndicator(null)
    document.body.classList.add('dragging')
  }

  const handleNativeDragEnd = () => {
    clearDragState()
  }

  const handleNativeDragOver = (event: React.DragEvent<HTMLDivElement>, index: number) => {
    event.preventDefault()
    event.stopPropagation()

    if (draggingIndex === null) return

    event.dataTransfer.dropEffect = 'move'

    const rect = event.currentTarget.getBoundingClientRect()
    const position = event.clientY - rect.top < rect.height / 2 ? 'before' : 'after'
    const nextIndicator = { index, position } as Exclude<DragIndicator, null>

    if (
      dragIndicator?.index !== nextIndicator.index ||
      dragIndicator?.position !== nextIndicator.position
    ) {
      setDragIndicator(nextIndicator)
    }
  }

  const handleNativeDrop = (event: React.DragEvent<HTMLDivElement>, fallbackIndex: number) => {
    event.preventDefault()
    event.stopPropagation()

    const sourceIndex = Number(event.dataTransfer.getData('text/plain'))
    if (Number.isNaN(sourceIndex)) {
      clearDragState()
      return
    }

    const nextIndicator =
      dragIndicator || ({ index: fallbackIndex, position: 'after' } as Exclude<DragIndicator, null>)
    const destinationIndex = getDestinationIndex(sourceIndex, nextIndicator, componentList.length)

    clearDragState()

    if (destinationIndex === null || destinationIndex === sourceIndex) {
      return
    }

    dispatch(
      reorderComponents({
        sourceIndex,
        destinationIndex
      })
    )
    message.success('组件顺序已更新', 0.5)
  }

  const isIndicatorVisible = (index: number, position: 'before' | 'after') => {
    if (!dragIndicator || dragIndicator.index !== index || dragIndicator.position !== position) {
      return false
    }
    if (draggingIndex === null) {
      return false
    }

    return getDestinationIndex(draggingIndex, dragIndicator, componentList.length) !== draggingIndex
  }

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

      {/* 问卷组件列表 - 使用原生拖拽实现排序 */}
      <div className="flex-1 px-4">
        {componentList.length > 0 ? (
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

            {componentList.map((component, index) => {
              const showBeforeIndicator = isIndicatorVisible(index, 'before')
              const showAfterIndicator = isIndicatorVisible(index, 'after')
              const isCurrentDraggingItem = draggingIndex === index

              return (
                <React.Fragment key={component.fe_id}>
                  <div
                    className={clsx(
                      'h-0.5 mx-2 my-1 rounded-full transition-all duration-150',
                      showBeforeIndicator
                        ? 'bg-custom-primary-100 opacity-100 scale-y-150'
                        : 'opacity-0'
                    )}
                  />

                  <div
                    ref={getRef(component.fe_id)}
                    data-draggable-root="true"
                    data-index={index}
                    onDragOver={event => handleNativeDragOver(event, index)}
                    onDrop={event => handleNativeDrop(event, index)}
                    className={clsx(
                      'mb-3 transition-all duration-200',
                      isCurrentDraggingItem && 'opacity-70 scale-[0.995]'
                    )}
                  >
                    <ComponentWapper
                      fe_id={component.fe_id}
                      dragHandleProps={{
                        draggable: true,
                        onDragStart: (event: React.DragEvent<HTMLDivElement>) =>
                          handleNativeDragStart(event, index),
                        onDragEnd: handleNativeDragEnd
                      }}
                      isDragging={isCurrentDraggingItem}
                    >
                      <ComponentRender component={component} />
                    </ComponentWapper>
                  </div>

                  <div
                    className={clsx(
                      'h-0.5 mx-2 my-1 rounded-full transition-all duration-150',
                      showAfterIndicator
                        ? 'bg-custom-primary-100 opacity-100 scale-y-150'
                        : 'opacity-0'
                    )}
                  />
                </React.Fragment>
              )
            })}
          </div>
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
