import React from 'react'
import { RouterProvider } from 'react-router-dom'
import router from '@/router'
import { App, ConfigProvider } from 'antd'
import store from '@/store'
import { Provider } from 'react-redux'
import { theme } from 'antd'
import zhCN from 'antd/es/locale/zh_CN'

const themeConfig = {
  token: {
    colorPrimary: '#26A69A',
    colorSuccess: '#26A69A',
    colorInfo: '#26A69A',
    colorWarning: '#26A69A',
    colorDanger: '#fe5a55',
    colorText: '#263339',
    colorTextDisabled: '#728f9e'
  },
  components: {
    Button: {
      colorPrimary: '#26A69A',
      colorPrimaryHover: '#408D86',
      colorPrimaryActive: '#1F8C81',
      primaryShadow: '0 2px 0 rgba(38,166,154, 0.1)',
      defaultHoverBorderColor: '#26A69A',
      defaultHoverColor: '#26A69A',
      defaultActiveBorderColor: '#1F8C81',
      defaultActiveColor: '#1F8C81'
    },
    Modal: {
      colorPrimary: '#26A69A'
    }
  },
  cssVar: true,
  algorithm: theme.defaultAlgorithm
}

const MyApp: React.FC = () => {
  return (
    <ConfigProvider theme={themeConfig} locale={zhCN}>
      <App>
        <Provider store={store}>
          <RouterProvider router={router}></RouterProvider>
        </Provider>
      </App>
    </ConfigProvider>
  )
}

export default MyApp
