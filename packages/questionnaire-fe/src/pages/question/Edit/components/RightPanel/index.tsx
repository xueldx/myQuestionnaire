/**
 * 编辑页右侧配置面板。
 * 这个文件属于页面配置 UI，负责在“题目配置 / 页面配置”之间切换。
 * AI 对话输入不应该让右侧配置区跟着重渲染，所以这里直接用 memo 隔离来自父页面的无关刷新。
 */
import React, { useState } from 'react'
import { Tabs } from 'antd'
import ComponentConfig from './ComponentConfig'
import PageConfig from './PageConfig'

const RightPanel: React.FC = () => {
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
`
  const [activeKey, setActiveKey] = useState('1')

  const items = [
    {
      key: '1',
      label: '物料配置',
      children: <ComponentConfig />
    },
    {
      key: '2',
      label: '页面配置',
      children: <PageConfig />
    }
  ]

  return (
    <div className="h-full flex flex-col overflow-hidden scrollbar-hide">
      <style>{customTabsStyles}</style>
      <Tabs defaultActiveKey="1" type="card" items={items} onChange={setActiveKey} />
    </div>
  )
}

export default React.memo(RightPanel)
