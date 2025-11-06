import React from 'react'
import { QuestionCheckboxPropsType, QuestionCheckboxDefaultProps } from './interface'
import { Checkbox } from 'antd'
import clsx from 'clsx'
import { normalizeStringList } from '@/utils/normalizeQuestionComponent'
const QuestionCheckbox: React.FC<QuestionCheckboxPropsType> = (
  customProps: QuestionCheckboxPropsType
) => {
  const mergedProps = { ...QuestionCheckboxDefaultProps, ...customProps }
  const title = mergedProps.title
  const column = mergedProps.column
  const options = normalizeStringList(mergedProps.options, QuestionCheckboxDefaultProps.options)
  return (
    <div className="flex flex-col gap-2 pointer-events-none">
      <div
        className="text-base font-bold text-ellipsis overflow-hidden whitespace-nowrap"
        title={title}
      >
        {title}
      </div>
      <div>
        <Checkbox.Group
          className={clsx('flex gap-2', column ? 'flex-col' : 'flex-row')}
          options={options}
        />
      </div>
    </div>
  )
}

export default QuestionCheckbox
