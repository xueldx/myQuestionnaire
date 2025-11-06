import React, { CSSProperties, ReactNode, useState } from 'react'
import { Tabs } from 'antd'
import ComponentMarket from './ComponentMarket'
import ComponentLayer from './ComponentLayer'
import { RobotOutlined } from '@ant-design/icons'

const tabContentStyle: CSSProperties = {
  height: '100%',
  overflowY: 'auto',
  padding: '4px',
  msOverflowStyle: 'none', // IE 和 Edge
  scrollbarWidth: 'none' // Firefox
}

const tabsStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%'
}

// 覆盖 Ant Design 的内部样式
const customTabsStyles = `
  .ant-tabs-content {
    height: 100%;
    flex: 1;
    overflow: hidden;
  }
  .ant-tabs-tabpane {
    height: 100%;
    overflow: hidden;
  }
  .ant-tabs-content-holder {
    flex: 1;
    overflow: hidden;
  }
  .left-panel-tabs .ai-tab-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 10px;
    border-radius: 999px;
    background: linear-gradient(135deg, rgba(38, 166, 154, 0.18), rgba(255, 193, 7, 0.24));
    color: #167c72;
    font-weight: 600;
  }
`

interface LeftPanelProps {
  activeKey?: string
  onActiveChange?: (key: string) => void
  aiTabContent?: ReactNode
}

const LeftPanel: React.FC<LeftPanelProps> = props => {
  const { activeKey: controlledActiveKey, onActiveChange, aiTabContent } = props
  const [innerActiveKey, setInnerActiveKey] = useState('market')
  const activeKey = controlledActiveKey ?? innerActiveKey

  const handleChange = (key: string) => {
    if (!controlledActiveKey) {
      setInnerActiveKey(key)
    }
    onActiveChange?.(key)
  }

  const items = [
    {
      key: 'market',
      label: '物料市场',
      children: (
        <div style={tabContentStyle}>
          <ComponentMarket />
        </div>
      )
    },
    {
      key: 'layer',
      label: '问卷图层',
      children: (
        <div style={tabContentStyle}>
          <ComponentLayer />
        </div>
      )
    },
    {
      key: 'ai',
      label: (
        <span className="ai-tab-label">
          <RobotOutlined />
          AI助手
        </span>
      ),
      children: <div style={tabContentStyle}>{aiTabContent}</div>
    }
  ]

  return (
    <div className="h-full flex flex-col overflow-hidden scrollbar-hide">
      <style>{customTabsStyles}</style>
      <Tabs
        activeKey={activeKey}
        type="card"
        onChange={handleChange}
        style={tabsStyle}
        className="left-panel-tabs"
        tabBarStyle={{ marginBottom: 0 }}
        items={items}
      />
    </div>
  )
}

export default LeftPanel
