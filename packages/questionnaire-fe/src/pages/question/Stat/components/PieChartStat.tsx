import React, { useEffect, useRef } from 'react'
import { Chart } from '@antv/g2'

interface StatItem {
  option: string
  count: number
  percentage: number
}

interface PieChartStatProps {
  question: string
  data: StatItem[]
}

/**
 * 饼图统计组件
 * 适用于：单选题、下拉选择题、图片选择题
 */
const PieChartStat: React.FC<PieChartStatProps> = ({ question, data }) => {
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

    // 配置图表
    chart
      .coordinate({ type: 'theta' })
      .interval()
      .data(data)
      .transform({ type: 'stackY' })
      .encode('y', 'percentage')
      .encode('color', 'option')
      .axis(false)
      .style({
        lineWidth: 1,
        fillOpacity: 0.85
      })
      .animate('enter', { type: 'waveIn' })
      .scale('color', {
        range: [
          '#ff4d4f', // Red
          '#1890ff', // Blue
          '#52c41a', // Green
          '#fadb14', // Yellow
          '#722ed1', // Purple
          '#fa8c16', // Orange
          '#13c2c2', // Teal
          '#eb2f96' // Magenta
        ]
      })
      .label({
        text: (d: StatItem) => `${d.option}\n${d.percentage?.toFixed(1)}%`,
        position: 'outside',
        style: {
          fontSize: 12,
          fill: '#4B5563',
          textAlign: 'center'
        },
        transform: [
          {
            type: 'overflowHide'
          }
        ]
      })
      .state('active', {
        style: {
          lineWidth: 2,
          fillOpacity: 0.95,
          stroke: '#fff'
        }
      })
      .interaction('elementHighlight')
      .tooltip({
        title: (d: StatItem) => d.option,
        items: [
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
  }, [data])

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6 transition-all duration-300 hover:shadow-md flex flex-col">
      <div className="flex items-center mb-3 sm:mb-4">
        <div className="w-1.5 sm:w-2 h-5 sm:h-6 bg-[#26A69A] rounded-full mr-2 sm:mr-3" />
        <h2 className="text-lg sm:text-xl font-semibold text-gray-800 line-clamp-2">{question}</h2>
      </div>

      <div
        ref={containerRef}
        className="h-72 sm:h-80 mb-3 sm:mb-4 bg-gray-50 rounded-lg p-2 sm:p-4 flex-grow"
      />

      <div className="grid grid-cols-1 gap-2 sm:gap-3">
        {data.map((item, index) => (
          <div
            key={index}
            className="bg-gray-50 rounded-lg p-2 sm:p-3 flex justify-between items-center transition-all duration-200 hover:bg-gray-100"
          >
            <span className="flex-1 overflow-hidden whitespace-nowrap text-ellipsis text-gray-600 text-xs sm:text-sm">
              {item.option}
            </span>
            <span className="ml-2 sm:ml-3 text-xs sm:text-sm font-medium text-gray-500 whitespace-nowrap">
              {`${item.count}人 (${item.percentage?.toFixed(1)}%)`}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default PieChartStat
