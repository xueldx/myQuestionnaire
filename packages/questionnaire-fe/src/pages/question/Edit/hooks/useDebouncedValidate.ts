import { useRef, useCallback } from 'react'
import { FormInstance } from 'antd'

/**
 * 防抖表单验证 Hook
 * 用于实时预览需要先验证表单的场景
 * @param form - Ant Design Form 实例
 * @param onValidSuccess - 验证成功的回调
 * @param delay - 防抖延迟时间（毫秒），默认 500ms
 */
export const useDebouncedValidate = (
  form: FormInstance,
  onValidSuccess: (values: any) => void,
  delay: number = 500
) => {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const debouncedValidate = useCallback(
    (changedValues: any, allValues: any) => {
      // 清除之前的计时器
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      // 设置新的计时器
      timeoutRef.current = setTimeout(() => {
        // 执行表单验证
        form
          .validateFields()
          .then(() => {
            // 验证通过，调用回调函数
            onValidSuccess(allValues)
          })
          .catch(() => {
            // 验证失败，不更新预览
            console.log('表单验证失败，不更新预览')
          })
      }, delay)
    },
    [form, onValidSuccess, delay]
  )

  return debouncedValidate
}
