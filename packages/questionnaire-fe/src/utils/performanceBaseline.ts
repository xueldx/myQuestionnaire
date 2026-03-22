/**
 * 这组工具只负责“测量”，不负责优化。
 * 目标是让我们在首页和编辑器页记录统一口径的业务时间，
 * 后面才能把优化前后的结果放在一起对比。
 */

type BaselineMetricName = 'home_first_usable' | 'edit_first_usable'

type BaselineMetricRecord = {
  name: BaselineMetricName
  duration: number
  recordedAt: string
}

declare global {
  interface Window {
    __questionnairePerfMetrics__?: BaselineMetricRecord[]
  }
}

const isBrowserPerfSupported = () =>
  typeof window !== 'undefined' &&
  typeof window.requestAnimationFrame === 'function' &&
  typeof performance !== 'undefined' &&
  typeof performance.mark === 'function' &&
  typeof performance.measure === 'function'

const ensureMetricStore = () => {
  if (typeof window === 'undefined') return []

  if (!window.__questionnairePerfMetrics__) {
    window.__questionnairePerfMetrics__ = []
  }

  return window.__questionnairePerfMetrics__
}

const storeMetricRecord = (name: BaselineMetricName, duration: number) => {
  if (typeof window === 'undefined') return

  const nextRecord: BaselineMetricRecord = {
    name,
    duration,
    recordedAt: new Date().toISOString()
  }

  const prevRecords = ensureMetricStore()
  window.__questionnairePerfMetrics__ = [...prevRecords, nextRecord]
  console.info(`[perf-baseline] ${name}: ${duration.toFixed(2)}ms`)
}

const measureFromNavigationStart = (name: BaselineMetricName) => {
  const endMark = `${name}_end`
  performance.mark(endMark)

  try {
    performance.measure(name, {
      start: 0,
      end: endMark
    })
  } catch (error) {
    console.warn(`[perf-baseline] 无法记录 ${name}`, error)
    return
  }

  const entries = performance.getEntriesByName(name, 'measure')
  const latestMeasure = entries[entries.length - 1]
  if (!latestMeasure) return

  storeMetricRecord(name, Number(latestMeasure.duration.toFixed(2)))
}

/**
 * 用“双 requestAnimationFrame”把埋点放到浏览器完成本轮渲染之后，
 * 这样测到的更接近“用户真的看到了，并且可以开始操作了”的时间点。
 */
export const recordBaselineMetricAfterNextPaint = (name: BaselineMetricName) => {
  ensureMetricStore()

  if (!isBrowserPerfSupported()) {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    return () => {}
  }

  let cancelled = false
  const rafIdList: number[] = []

  const firstRafId = window.requestAnimationFrame(() => {
    const secondRafId = window.requestAnimationFrame(() => {
      if (cancelled) return
      measureFromNavigationStart(name)
    })
    rafIdList.push(secondRafId)
  })

  rafIdList.push(firstRafId)

  return () => {
    cancelled = true
    rafIdList.forEach(id => window.cancelAnimationFrame(id))
  }
}
