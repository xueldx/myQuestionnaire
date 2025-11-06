import React from 'react'
import { QuestionDropdownPropsType, QuestionDropdownDefaultProps } from './interface'
import { Select } from 'antd'
import { normalizeStringList } from '@/utils/normalizeQuestionComponent'

const QuestionDropdown: React.FC<QuestionDropdownPropsType> = (
  customProps: QuestionDropdownPropsType
) => {
  const mergedProps = { ...QuestionDropdownDefaultProps, ...customProps }
  const title = mergedProps.title
  const placeholder = mergedProps.placeholder
  const options = normalizeStringList(mergedProps.options, QuestionDropdownDefaultProps.options)
  return (
    <div className="flex flex-col gap-2 pointer-events-none">
      <div
        className="text-base font-bold text-ellipsis overflow-hidden whitespace-nowrap"
        title={title}
      >
        {title}
      </div>
      <div>
        <Select
          placeholder={placeholder}
          style={{ width: '100%' }}
          options={options.map(opt => ({ label: opt, value: opt }))}
        />
      </div>
    </div>
  )
}

export default QuestionDropdown
