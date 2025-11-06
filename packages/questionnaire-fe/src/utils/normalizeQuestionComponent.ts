import { ComponentType } from '@/components/QuestionComponents'
import { getComponentDefaultProps } from '@/utils/getComponentDefaultProps'
import { ComponentInfoType } from '@/store/modules/componentsSlice'

const DISPLAY_TEXT_KEYS = ['label', 'text', 'value', 'title', 'content', 'name'] as const

const ensurePlainObject = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

export const getDisplayText = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const plainObject = value as Record<string, unknown>
    for (const key of DISPLAY_TEXT_KEYS) {
      const candidate = plainObject[key]
      if (typeof candidate === 'string') return candidate
      if (typeof candidate === 'number' || typeof candidate === 'boolean') {
        return String(candidate)
      }
    }
  }

  return fallback
}

export const normalizeStringList = (value: unknown, fallback: string[] = []) => {
  if (!Array.isArray(value)) return [...fallback]

  const normalized = value.map(item => getDisplayText(item).trim()).filter(Boolean)

  return normalized.length > 0 ? normalized : [...fallback]
}

export const normalizeComponentPropsByType = (
  type: string,
  props: Record<string, unknown>,
  defaultProps: Record<string, unknown>
) => {
  const normalizedProps = {
    ...defaultProps,
    ...props
  }

  switch (type) {
    case ComponentType.QuestionRadio:
    case ComponentType.QuestionCheckbox:
    case ComponentType.QuestionDropdown:
      normalizedProps.options = normalizeStringList(
        normalizedProps.options,
        normalizeStringList(defaultProps.options)
      )
      break
    case ComponentType.QuestionMatrixRadio:
    case ComponentType.QuestionMatrixCheckbox:
      normalizedProps.rows = normalizeStringList(
        normalizedProps.rows,
        normalizeStringList(defaultProps.rows)
      )
      normalizedProps.columns = normalizeStringList(
        normalizedProps.columns,
        normalizeStringList(defaultProps.columns)
      )
      break
    default:
      break
  }

  return normalizedProps
}

export const normalizeQuestionnaireComponent = (
  component: ComponentInfoType,
  fallbackId?: string
): ComponentInfoType | null => {
  const defaultInfo = getComponentDefaultProps(component.type)
  if (!defaultInfo) return null

  const defaultProps = ensurePlainObject(defaultInfo.props)
  const componentProps = ensurePlainObject(component.props)
  const props = normalizeComponentPropsByType(component.type, componentProps, defaultProps)
  const title =
    getDisplayText(props.title).trim() ||
    getDisplayText(component.title).trim() ||
    defaultInfo.title

  return {
    fe_id: getDisplayText(component.fe_id).trim() || fallbackId || '',
    type: component.type,
    title,
    props: {
      ...props,
      title
    } as any
  }
}

export const normalizeQuestionnaireComponentList = (components: ComponentInfoType[] = []) => {
  return components
    .map((component, index) =>
      normalizeQuestionnaireComponent(component, `normalized-component-${index + 1}`)
    )
    .filter(Boolean) as ComponentInfoType[]
}
