import apis from '@/apis'
import { reportAiMetricOutcome } from '@/pages/question/Edit/hooks/ai/aiMetricOutcome'

jest.mock('@/apis', () => ({
  __esModule: true,
  default: {
    aiApi: {
      reportMetricOutcome: jest.fn()
    }
  }
}))

describe('aiMetricOutcome', () => {
  const reportMetricOutcome = apis.aiApi.reportMetricOutcome as jest.Mock

  beforeEach(() => {
    reportMetricOutcome.mockReset()
    jest.restoreAllMocks()
  })

  it('skips reporting when requestId is empty', async () => {
    await expect(reportAiMetricOutcome('', { draftApplied: true })).resolves.toBe(false)
    expect(reportMetricOutcome).not.toHaveBeenCalled()
  })

  it('returns true only when the backend confirms the update', async () => {
    reportMetricOutcome.mockResolvedValue({
      code: 1,
      data: {
        updated: true
      }
    })

    await expect(
      reportAiMetricOutcome('req-1', {
        draftApplied: true
      })
    ).resolves.toBe(true)

    expect(reportMetricOutcome).toHaveBeenCalledWith('req-1', {
      draftApplied: true
    })
  })

  it('returns false and logs a warning when reporting fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    reportMetricOutcome.mockRejectedValue(new Error('network failed'))

    await expect(
      reportAiMetricOutcome('req-2', {
        autoSaveFailed: true
      })
    ).resolves.toBe(false)

    expect(warnSpy).toHaveBeenCalled()
  })
})
