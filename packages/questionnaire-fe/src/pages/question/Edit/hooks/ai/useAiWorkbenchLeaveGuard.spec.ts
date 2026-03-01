import { shouldBlockAiWorkbenchLeave } from '@/pages/question/Edit/hooks/ai/useAiWorkbenchLeaveGuard'

describe('useAiWorkbenchLeaveGuard helpers', () => {
  it('blocks leaving when a stream is still running', () => {
    expect(
      shouldBlockAiWorkbenchLeave({
        status: 'drafting',
        composerInput: '',
        hasPendingAiResult: false
      })
    ).toBe(true)
  })

  it('blocks leaving when there is a pending ai result or unsent input', () => {
    expect(
      shouldBlockAiWorkbenchLeave({
        status: 'idle',
        composerInput: '',
        hasPendingAiResult: true
      })
    ).toBe(true)

    expect(
      shouldBlockAiWorkbenchLeave({
        status: 'idle',
        composerInput: '我还没发送这段需求',
        hasPendingAiResult: false
      })
    ).toBe(true)
  })

  it('does not block leaving when the workbench is clean', () => {
    expect(
      shouldBlockAiWorkbenchLeave({
        status: 'idle',
        composerInput: '',
        hasPendingAiResult: false
      })
    ).toBe(false)
  })
})
