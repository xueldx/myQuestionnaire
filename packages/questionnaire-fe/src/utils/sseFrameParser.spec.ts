import { consumeSseBuffer, parseSseChunk } from '@/utils/sseFrameParser'

describe('sseFrameParser', () => {
  it('parses a single SSE chunk', () => {
    const parsed = parseSseChunk<{ message: string }>('event: warning\ndata: {"message":"first"}')

    expect(parsed.event).toBe('warning')
    expect(parsed.data).toEqual({ message: 'first' })
  })

  it('consumes complete frames and keeps the trailing partial frame', () => {
    const frames: Array<{ event: string; data: { delta: string } | null }> = []
    const remaining = consumeSseBuffer(
      [
        'event: prompt_delta',
        'data: {"delta":"hello"}',
        '',
        'event: prompt_delta',
        'data: {"delta":" world"}',
        '',
        'event: prompt_delta',
        'data: {"delta":"tail"}'
      ].join('\n'),
      frame => {
        frames.push(frame)
      }
    )

    expect(frames).toEqual([
      {
        event: 'prompt_delta',
        data: { delta: 'hello' }
      },
      {
        event: 'prompt_delta',
        data: { delta: ' world' }
      }
    ])
    expect(remaining).toBe('event: prompt_delta\ndata: {"delta":"tail"}')
  })

  it('falls back to plain text payloads when chunk data is not JSON', () => {
    const parsed = parseSseChunk('data: {[DONE]}')

    expect(parsed).toEqual({
      event: 'message',
      data: '{[DONE]}'
    })
  })
})
