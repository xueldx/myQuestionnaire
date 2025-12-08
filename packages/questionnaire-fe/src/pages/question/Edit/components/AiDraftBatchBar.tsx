import React from 'react'
import { ComponentInfoType } from '@/store/modules/componentsSlice'

export const AiDraftInsertHint: React.FC<{
  currentComponents: ComponentInfoType[]
  selectedId: string
}> = ({ currentComponents, selectedId }) => {
  const selectedIndex =
    selectedId == null
      ? -1
      : currentComponents.findIndex(component => component.fe_id === selectedId)
  const selectedComponent = selectedIndex >= 0 ? currentComponents[selectedIndex] : null

  return (
    <div className="rounded-2xl border border-[#F7D9A7] bg-[#FFF9ED]/95 px-4 py-3 text-sm text-[#7C5C00] shadow-sm backdrop-blur-sm">
      <div className="font-semibold text-[#9A6700]">新增题目插入位置</div>
      <div className="mt-1 leading-6">
        {currentComponents.length === 0 ? (
          '本批题目会按 AI 草稿顺序，从第 1 项开始依次创建到当前问卷中。'
        ) : selectedComponent ? (
          <>
            当前已选中
            <span className="mx-1 font-semibold text-[#9A6700]">第 {selectedIndex + 1} 项</span>
            之后：
            <span className="ml-1 font-medium text-custom-text-100">
              {selectedComponent.title || '未命名题目'}
            </span>
          </>
        ) : (
          '当前未选中题目，本批新增会直接追加到当前问卷末尾。'
        )}
      </div>
      {currentComponents.length === 0 ? (
        <div className="mt-1 text-xs text-[#8C6A12]">
          你可以逐题接受，已接受内容会按草稿顺序连续加入问卷。
        </div>
      ) : selectedComponent ? (
        <div className="mt-1 text-xs text-[#8C6A12]">
          切换问卷图层中的选中题目后，这里的插入位置会实时更新。
        </div>
      ) : (
        <div className="mt-1 text-xs text-[#8C6A12]">
          选中问卷图层中的某一题后，这里的插入位置会实时更新。
        </div>
      )}
    </div>
  )
}
