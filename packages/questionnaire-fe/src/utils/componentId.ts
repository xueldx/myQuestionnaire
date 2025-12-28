const DEFAULT_COMPONENT_ID_PREFIX = 'question'

let fallbackCounter = 0

const normalizeId = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

const buildDedupedId = (baseId: string, usedIds: Set<string>) => {
  let suffix = 1
  let candidate = `${baseId}-${suffix}`

  while (usedIds.has(candidate)) {
    suffix += 1
    candidate = `${baseId}-${suffix}`
  }

  return candidate
}

const getRandomToken = () => {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return uuid

  fallbackCounter += 1
  return `${Date.now().toString(36)}-${fallbackCounter.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`
}

export const createComponentFeId = () => `${DEFAULT_COMPONENT_ID_PREFIX}-${getRandomToken()}`

export const claimUniqueComponentFeId = (
  usedIds: Set<string>,
  preferredId = '',
  fallbackBase = DEFAULT_COMPONENT_ID_PREFIX
) => {
  const baseId = normalizeId(preferredId) || fallbackBase
  const nextId = usedIds.has(baseId) ? buildDedupedId(baseId, usedIds) : baseId
  usedIds.add(nextId)
  return nextId
}

export const assignUniqueComponentFeIds = <T extends { fe_id: string }>(
  components: T[],
  options?: {
    reservedIds?: Iterable<string>
    fallbackPrefix?: string
  }
) => {
  const usedIds = new Set(
    Array.from(options?.reservedIds || [])
      .map(id => normalizeId(id))
      .filter(Boolean)
  )
  const fallbackPrefix = options?.fallbackPrefix || DEFAULT_COMPONENT_ID_PREFIX

  return components.map((component, index) => {
    const nextId = claimUniqueComponentFeId(
      usedIds,
      component.fe_id,
      `${fallbackPrefix}-${index + 1}`
    )

    return nextId === component.fe_id ? component : { ...component, fe_id: nextId }
  })
}
