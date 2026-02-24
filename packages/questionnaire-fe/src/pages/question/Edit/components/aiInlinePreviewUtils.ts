import { ComponentInfoType } from '@/store/modules/componentsSlice'

export type AnnotationTone = 'current' | 'suggestion' | 'danger' | 'info' | 'anchor'

const stringifyValue = (value: unknown) => JSON.stringify(value ?? null)

export const hasComponentChanged = (current: ComponentInfoType, next: ComponentInfoType) =>
  current.type !== next.type ||
  current.title !== next.title ||
  stringifyValue(current.props) !== stringifyValue(next.props)

export const buildAddedInsertMap = (
  currentComponents: ComponentInfoType[],
  draftComponents: ComponentInfoType[]
) => {
  const currentIds = new Set(currentComponents.map(component => component.fe_id))
  const insertMap = new Map<string, ComponentInfoType[]>()
  let anchorKey = '__start__'

  draftComponents.forEach(component => {
    if (currentIds.has(component.fe_id)) {
      anchorKey = component.fe_id
      return
    }

    const targetList = insertMap.get(anchorKey) || []
    targetList.push(component)
    insertMap.set(anchorKey, targetList)
  })

  return insertMap
}
