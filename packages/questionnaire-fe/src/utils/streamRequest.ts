import { LOGIN_PATH } from '@/router'
import { getTokenFromStorage } from '@/utils'
import { consumeSseBuffer, parseSseChunk, ParsedSseFrame } from '@/utils/sseFrameParser'

type StreamRequestOptions<TEvent> = {
  url: string
  method?: 'GET' | 'POST'
  body?: unknown
  signal?: AbortSignal
  onEvent: (event: ParsedSseFrame<TEvent>) => void
}

const streamRequest = async <TEvent>({
  url,
  method = 'POST',
  body,
  signal,
  onEvent
}: StreamRequestOptions<TEvent>) => {
  const token = getTokenFromStorage()

  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'text/event-stream',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    signal
  })

  if (response.status === 401) {
    window.location.href = `${LOGIN_PATH}?redirect=${window.location.pathname}`
    throw new Error('登录状态已失效，请重新登录')
  }

  if (!response.ok) {
    const text = await response.text()
    if (!text) {
      throw new Error('流式请求失败')
    }

    let nextMessage = text
    try {
      const parsed = JSON.parse(text)
      nextMessage = parsed?.message || parsed?.error || text
    } catch (e) {
      // Ignore parse error, fallback to raw text
    }

    throw new Error(nextMessage)
  }

  if (!response.body) {
    throw new Error('浏览器不支持流式响应')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    buffer = consumeSseBuffer<TEvent>(buffer, parsed => {
      onEvent(parsed)
    })
  }

  const remaining = buffer.trim()
  if (remaining) {
    const parsed = parseSseChunk<TEvent>(remaining)
    onEvent(parsed)
  }
}

export default streamRequest
