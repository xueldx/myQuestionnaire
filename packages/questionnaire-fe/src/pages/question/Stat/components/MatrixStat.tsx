import React, { useEffect, useRef } from 'react'
import { Chart } from '@antv/g2'

interface MatrixStatItem {
  row: string
  column: string
  count: number
  percentage: number
}

interface MatrixStatProps {
  question: string
  data: MatrixStatItem[]
  rows: string[]
  columns: string[]
}

/**
 * 矩阵热力图统计组件
 * 适用于：矩阵单选题、矩阵多选题
 */
const MatrixStat: React.FC<MatrixStatProps> = ({ question, data, rows, columns }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<Chart>()

  useEffect(() => {
    if (!containerRef.current) return

    // 清除之前的图表实例
    if (chartRef.current) {
      chartRef.current.destroy()
    }

    // 创建新图表
    const chart = new Chart({
      container: containerRef.current,
      autoFit: true,
      padding: 40,
      theme: 'light'
    })
    chartRef.current = chart

    // 配置热力图
    chart
      .cell()
      .data(data)
      .encode('x', 'column')
      .encode('y', 'row')
      .encode('color', 'percentage')
      .encode('size', 'percentage')
      .scale('y', {
        domain: rows
      })
      .scale('x', {
        domain: columns
      })
      .scale('color', {
        domain: [0, 100],
        range: ['#F9FAFB', '#26A69A']
      })
      .axis('x', {
        title: false,
        label: {
          style: {
            fill: '#4B5563',
            fontSize: 12
          }
        }
      })
      .axis('y', {
        title: false,
        label: {
          style: {
            fill: '#4B5563',
            fontSize: 12
          }
        }
      })
      .style({
        radius: 4
      })
      .animate('enter', {
        type: 'fadeIn',
        duration: 800
      })
      .label({
        text: (d: MatrixStatItem) => `${d.percentage.toFixed(1)}%`,
        style: {
          fill: (d: MatrixStatItem) => (d.percentage > 50 ? '#FFFFFF' : '#374151'),
          fontSize: 12,
          textAlign: 'center'
        }
      })
      .tooltip({
        items: [
          { field: 'row', label: '行选项' },
          { field: 'column', label: '列选项' },
          { field: 'count', label: '人数' },
          { field: 'percentage', label: '占比', transform: (v: number) => `${v.toFixed(1)}%` }
        ]
      })

    chart.render()

    // 监听容器大小变化，自动调整图表大小
    const observer = new ResizeObserver(() => {
      chart.forceFit()
    })
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
      chart.destroy()
    }
  }, [data, rows, columns])

  // 按行分组显示数据
  const dataByRow = rows.map(row => {
    const rowData = data.filter(item => item.row === row)
    return {
      row,
      columns: rowData
    }
  })

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6 transition-all duration-300 hover:shadow-md flex flex-col">
      <div className="flex items-center mb-3 sm:mb-4">
        <div className="w-1.5 sm:w-2 h-5 sm:h-6 bg-[#26A69A] rounded-full mr-2 sm:mr-3" />
        <h2 className="text-lg sm:text-xl font-semibold text-gray-800 line-clamp-2">{question}</h2>
      </div>

      <div
        ref={containerRef}
        className="h-80 sm:h-96 mb-3 sm:mb-4 bg-gray-50 rounded-lg p-2 sm:p-4 flex-grow"
      />

      <div className="grid grid-cols-1 gap-4">
        {dataByRow.map((rowGroup, rowIndex) => (
          <div key={rowIndex} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
            <h3 className="text-gray-700 text-sm font-semibold mb-2 pb-2 border-b border-gray-200">
              {rowGroup.row}
            </h3>
            <div className="grid grid-cols-1 gap-2">
              {rowGroup.columns.map((item, colIndex) => (
                <div
                  key={colIndex}
                  className="flex justify-between items-center py-1 transition-all duration-200 hover:bg-white hover:px-2 rounded group"
                >
                  <span className="text-gray-600 text-xs sm:text-sm group-hover:text-gray-800">
                    {item.column}
                  </span>
                  <div className="flex items-center">
                    <div
                      className="h-2 rounded bg-[#26A69A] opacity-80"
                      style={{ width: `${Math.max(item.percentage, 5)}px` }}
                    ></div>
                    <span className="ml-2 text-xs text-[#26A69A] font-medium">
                      {`${item.count}人 (${item.percentage.toFixed(1)}%)`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default MatrixStat
