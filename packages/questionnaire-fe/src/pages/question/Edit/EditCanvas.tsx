import React, { useState, useEffect } from 'react'
import ComponentWapper from '@/pages/question/Edit/components/ComponentWapper'
import ComponentRender from '@/pages/question/Edit/components/ComponentRender'
import { useSelector, useDispatch } from 'react-redux'
import { RootState } from '@/store'
import useScrollToSelected from '@/pages/question/Edit/hooks/useScrollToSelected'
import { Typography, App } from 'antd'
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd'
import { reorderComponents } from '@/store/modules/componentsSlice'
import DevTools from '@/components/DevTools'
import clsx from 'clsx'

const { Title, Paragraph } = Typography

// 添加用于测试的内联样式，确保拖拽区域明显可见
const TEST_MODE = false

const EditCanvas: React.FC = () => {
  const { message } = App.useApp()
  const componentList = useSelector((state: RootState) => state.components.componentList)
  const pageConfig = useSelector((state: RootState) => state.pageConfig)
  const { getRef } = useScrollToSelected()
  const dispatch = useDispatch()
  const [isDragging, setIsDragging] = useState(false)
  const [enableDrag, setEnableDrag] = useState(true)

  // 正常的React-Beautiful-DND拖放实现
  // ==============================

  useEffect(() => {
    // 添加全局CSS样式
    const style = document.createElement('style')
    style.textContent = `
      /* 拖拽相关全局样式 */
      body.dragging {
        cursor: grabbing !important;
      }
      /* 拖拽时的放置目标样式 */
      .draggable-component:not(.is-dragging) + .drop-placeholder {
        display: none;
      }
      /* 拖拽时的组件间隔样式 */
      .drop-indicator {
        height: 2px;
        margin: 8px 0;
        background-color: #1890ff;
        opacity: 0;
        transition: all 0.2s;
      }
      /* 拖拽悬停时显示指示器 */
      .dropping-area .drop-indicator {
        opacity: 1;
        height: 4px;
      }
    `
    document.head.appendChild(style)
    return () => {
      document.head.removeChild(style)
    }
  }, [])

  // 强制重新渲染以确保react-beautiful-dnd正确初始化
  const [, forceUpdate] = useState({})
  useEffect(() => {
    // 初始化时强制更新一次
    forceUpdate({})
    console.log('拖拽功能初始化完成 - 请尝试拖拽组件')
  }, [])

  // 监听组件列表变化，重新初始化拖拽功能
  useEffect(() => {
    // 当组件列表变化时，暂时禁用拖拽功能，等待DOM更新完成
    setEnableDrag(false)

    // 使用setTimeout确保DOM完全更新后再重新启用拖拽
    const timer = setTimeout(() => {
      setEnableDrag(true)
      forceUpdate({})
      console.log('组件列表已更新，重新初始化拖拽功能')
    }, 50)

    return () => clearTimeout(timer)
  }, [componentList])

  // 增加调试信息
  useEffect(() => {
    console.log('当前组件列表:', componentList)
  }, [componentList])

  // 处理拖拽结束事件
  const handleDragEnd = (result: any) => {
    console.log('🟢 拖拽结束:', result)
    setIsDragging(false)
    document.body.classList.remove('dragging')

    // 移除所有的拖拽指示器样式
    document.querySelectorAll('.dropping-area').forEach(el => {
      el.classList.remove('dropping-area')
    })

    const { source, destination } = result

    // 如果没有目标位置或者没有移动位置，则不做任何操作
    if (!destination || source.index === destination.index) {
      console.log('拖拽取消或位置未变化')
      return
    }

    console.log(`将组件从位置 ${source.index} 移动到位置 ${destination.index}`)
    // 更新组件顺序
    dispatch(
      reorderComponents({
        sourceIndex: source.index,
        destinationIndex: destination.index
      })
    )

    // 显示拖拽成功提示
    message.success('组件顺序已更新', 0.5)
  }

  // 处理开始拖拽
  const handleDragStart = (start: any) => {
    console.log('🟠 拖拽开始:', start)
    setIsDragging(true)
    document.body.classList.add('dragging')

    // 为被拖拽的元素添加类
    const draggingElem = document.querySelector(`[data-rbd-draggable-id="${start.draggableId}"]`)
    if (draggingElem) {
      draggingElem.classList.add('is-dragging')
    }
  }

  // 处理拖拽更新事件
  const handleDragUpdate = (update: any) => {
    console.log('🔵 拖拽更新:', update)

    // 清除所有之前的dropping-area标记
    document.querySelectorAll('.dropping-area').forEach(el => {
      el.classList.remove('dropping-area')
    })

    // 如果有目标位置，标记新的dropping-area
    if (update.destination) {
      const destinationIndex = update.destination.index
      const droppableArea = document.querySelector(`[data-rbd-droppable-id="question-components"]`)

      if (droppableArea) {
        // 添加整体拖放区域标记
        droppableArea.classList.add('dropping-area')

        // 显示将要插入的位置
        const components = droppableArea.querySelectorAll('.draggable-component')
        if (destinationIndex < components.length) {
          components[destinationIndex].classList.add('dropping-above')
        } else {
          const lastComponent = components[components.length - 1]
          if (lastComponent) {
            lastComponent.classList.add('dropping-below')
          }
        }
      }
    }
  }

  // 简化ref合并函数
  const setRefs = (el: any, provided: any, callbackRef: any) => {
    if (provided && provided.innerRef) {
      provided.innerRef(el)
    } else {
      console.warn('provided.innerRef 不可用')
    }
    if (callbackRef) callbackRef(el)
  }

  // 备用的HTML5原生拖放实现
  // ==============================

  // 原生拖拽开始事件处理
  const handleNativeDragStart = (e: React.DragEvent, index: number) => {
    console.log('原生拖拽开始:', index)
    // 设置拖拽数据
    e.dataTransfer.setData('text/plain', String(index))
    e.dataTransfer.effectAllowed = 'move'
    // 设置拖拽状态
    setIsDragging(true)
  }

  // 原生拖拽结束事件处理
  const handleNativeDragEnd = () => {
    console.log('原生拖拽结束')
    setIsDragging(false)
  }

  // 原生拖拽放置事件处理
  const handleNativeDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    const sourceIndex = Number(e.dataTransfer.getData('text/plain'))
    console.log(`原生拖拽: 从 ${sourceIndex} 到 ${targetIndex}`)

    if (sourceIndex !== targetIndex) {
      // 更新组件顺序
      dispatch(
        reorderComponents({
          sourceIndex,
          destinationIndex: targetIndex
        })
      )
      message.success('组件顺序已更新', 0.5)
    }
    setIsDragging(false)
  }

  // 原生拖拽悬停事件处理
  const handleNativeDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
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

      {/* 问卷组件列表 - 使用DragDropContext实现拖拽 */}
      <div className="flex-1 px-4">
        {componentList.length > 0 ? (
          enableDrag ? (
            <DragDropContext
              onDragEnd={handleDragEnd}
              onDragStart={handleDragStart}
              onDragUpdate={handleDragUpdate}
            >
              <Droppable droppableId="question-components">
                {(provided: any, snapshot: any) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={clsx(
                      'rounded-lg transition-all duration-300',
                      snapshot.isDraggingOver
                        ? 'bg-custom-primary-300 border border-custom-primary-100 shadow-inner'
                        : 'bg-custom-bg-100 border border-custom-bg-200',
                      isDragging && 'dropping-container'
                    )}
                    style={{
                      cursor: snapshot.isDraggingOver ? 'grabbing' : 'auto',
                      minHeight: '100px',
                      padding: '8px'
                    }}
                  >
                    {/* 拖拽时的提示 */}
                    {componentList.length > 1 && (
                      <div className="text-xs text-center py-2 text-custom-text-200 mb-2 bg-custom-bg-200 rounded font-medium">
                        {isDragging ? '↕️ 请拖放到目标位置...' : '↕️ 可通过拖拽组件调整顺序'}
                      </div>
                    )}

                    {componentList.map((component, index) => (
                      <React.Fragment key={component.fe_id}>
                        {/* 组件之间的拖拽指示器 */}
                        {index === 0 && (
                          <div
                            className="drop-indicator"
                            data-position="before"
                            data-index={index}
                          />
                        )}

                        <Draggable draggableId={component.fe_id} index={index}>
                          {(provided: any, snapshot: any) => (
                            <div
                              ref={el => setRefs(el, provided, getRef(component.fe_id))}
                              {...provided.draggableProps}
                              data-index={index}
                              className={clsx(
                                'mb-3 transition-all duration-200 draggable-component',
                                snapshot.isDragging && 'z-50 shadow-xl scale-[1.01] is-dragging'
                              )}
                              draggable="true"
                              onDragStart={e => handleNativeDragStart(e, index)}
                              onDragEnd={handleNativeDragEnd}
                              onDragOver={handleNativeDragOver}
                              onDrop={e => handleNativeDrop(e, index)}
                            >
                              <ComponentWapper
                                fe_id={component.fe_id}
                                dragHandleProps={provided.dragHandleProps}
                                isDragging={snapshot.isDragging}
                              >
                                <ComponentRender component={component} />
                              </ComponentWapper>
                            </div>
                          )}
                        </Draggable>

                        {/* 组件之间的拖拽指示器 */}
                        <div className="drop-indicator" data-position="after" data-index={index} />
                      </React.Fragment>
                    ))}

                    {/* 拖拽占位符 - 增强视觉效果 */}
                    <div
                      className={clsx(
                        'transition-all duration-300',
                        snapshot.isDraggingOver &&
                          'drop-placeholder bg-custom-primary-300 border-2 border-dashed border-custom-primary-100 rounded-lg p-2 my-2 min-h-[60px] flex items-center justify-center'
                      )}
                    >
                      {snapshot.isDraggingOver && (
                        <div className="text-custom-primary-200 text-sm font-medium animate-pulse">
                          ↓ 放置到这里 ↓
                        </div>
                      )}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          ) : (
            // 拖拽功能暂时禁用时显示正常组件列表
            <div
              className="rounded-lg transition-all duration-300 bg-custom-bg-100 border border-custom-bg-200"
              style={{ minHeight: '100px', padding: '8px' }}
            >
              {componentList.length > 1 && (
                <div className="text-xs text-center py-2 text-custom-text-200 mb-2 bg-custom-bg-200 rounded font-medium">
                  正在初始化拖拽功能...
                </div>
              )}
              {componentList.map(component => (
                <div key={component.fe_id} className="mb-3 transition-all duration-200">
                  <ComponentWapper fe_id={component.fe_id} isDragging={false}>
                    <ComponentRender component={component} />
                  </ComponentWapper>
                </div>
              ))}
            </div>
          )
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
