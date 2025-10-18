import React, { useEffect, useRef } from 'react'
import { Chart } from '@antv/g2'

interface StatItem {
  option: string
  count: number
  percentage: number
}

interface BarChartStatProps {
  question: string
  data: StatItem[]
}

/**
 * 柱状图统计组件
 * 适用于：多选题
 */
const BarChartStat: React.FC<BarChartStatProps> = ({ question, data }) => {
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
      .interval()
      .data(data)
      .transform({ type: 'sortX', by: 'y', reverse: true })
      .encode('x', 'option')
      .encode('y', 'count')
      .encode('color', 'option')
      .axis('y', {
        title: false,
        grid: true,
        label: {
          style: {
            fill: '#4B5563'
          }
        }
      })
      .axis('x', {
        title: false,
        label: {
          style: {
            fill: '#4B5563'
          }
        }
      })
      .style({
        fillOpacity: 0.85
      })
      .animate('enter', { type: 'fadeIn' })
      .scale('y', { nice: true })
      .scale('color', {
        range: [
          '#ff4d4f',
          '#1890ff',
          '#52c41a',
          '#fadb14',
          '#722ed1',
          '#fa8c16',
          '#13C2C2',
          '#eb2f96'
        ]
      })
      .label({
        text: (d: StatItem) => `${d.count}人\n${d.percentage?.toFixed(1)}%`,
        position: 'top',
        style: {
          fontSize: 12,
          fill: '#4B5563',
          textAlign: 'center'
        }
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
            <span className="ml-2 sm:ml-3 text-xs sm:text-sm font-medium text-[#26A69A] whitespace-nowrap">
              {`${item.count}人 (${item.percentage?.toFixed(1)}%)`}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default BarChartStat
