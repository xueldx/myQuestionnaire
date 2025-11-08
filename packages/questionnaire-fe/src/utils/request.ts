import { LOGIN_PATH } from '@/router'
import axios, { AxiosError, AxiosInstance, AxiosResponse } from 'axios'
import { getTokenFromStorage } from '@/utils/index'

const instance: AxiosInstance = axios.create({
  timeout: 10000
})

instance.interceptors.request.use(config => {
  const token = getTokenFromStorage()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

instance.interceptors.response.use(
  (response: AxiosResponse) => {
    return response.data
  },
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      window.location.href = LOGIN_PATH + '?redirect=' + window.location.pathname
    }

    console.error(error)

    const backendMsg =
      typeof error.response?.data === 'object' &&
      error.response?.data &&
      'message' in error.response.data
        ? String(error.response.data.message)
        : ''
    return {
      code: 0,
      msg:
        (backendMsg ? `${backendMsg}; ` : '') +
        '出错啦,请联系项目维护者或检查服务日志。' +
        error.message,
      data: null
    }
  }
)

export default instance
