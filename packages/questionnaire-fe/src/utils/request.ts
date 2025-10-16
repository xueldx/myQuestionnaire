import { LOGIN_PATH } from '@/router'
import axios, { AxiosError, AxiosInstance, AxiosResponse } from 'axios'
import { getTokenFromStorage } from '@/utils/index'

// 创建axios实例
const instance: AxiosInstance = axios.create({
  timeout: 10000
})

// 请求拦截器
instance.interceptors.request.use(config => {
  const token = getTokenFromStorage()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 响应拦截器
instance.interceptors.response.use(
  (response: AxiosResponse) => {
    return response.data
  },
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      window.location.href = LOGIN_PATH + '?redirect=' + window.location.pathname
    }
    console.error(error)
    navigator.clipboard.writeText('xueldx@163.com')
    return {
      code: 0,
      msg: '出错啦,可以联系开发者修复,联系方式已复制到剪贴板!' + error.message,
      data: null
    }
  }
)

export default instance
