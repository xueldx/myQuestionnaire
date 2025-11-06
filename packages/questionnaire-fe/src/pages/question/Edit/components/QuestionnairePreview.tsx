import React from 'react'
import { Empty, Typography } from 'antd'
import { ComponentInfoType } from '@/store/modules/componentsSlice'
import ComponentRender from '@/pages/question/Edit/components/ComponentRender'

const { Title, Paragraph } = Typography

interface QuestionnairePreviewProps {
  title: string
  description: string
  footerText: string
  components: ComponentInfoType[]
  emptyTitle?: string
  emptyDescription?: string
}

const QuestionnairePreview: React.FC<QuestionnairePreviewProps> = ({
  title,
  description,
  footerText,
  components,
  emptyTitle = '暂无预览内容',
  emptyDescription = '等待 AI 生成草稿'
}) => {
  return (
    <div className="h-full overflow-y-auto custom-no-scrollbar bg-custom-bg-100 rounded-[28px] border-4 border-custom-bg-300 shadow-inner">
      <div className="pt-6 px-5 pb-3 border-b border-custom-bg-200">
        <Title
          level={3}
          style={{
            color: 'rgb(38, 166, 154)',
            textAlign: 'center',
            marginBottom: '8px'
          }}
        >
          {title || '未命名问卷'}
        </Title>

        <Paragraph
          style={{
            textAlign: 'center',
            fontSize: '14px',
            marginBottom: 0,
            color: 'rgb(114, 143, 158)'
          }}
        >
          {description || '暂无描述'}
        </Paragraph>
      </div>

      <div className="px-4 py-4">
        {components.length > 0 ? (
          <div className="space-y-3 pointer-events-none select-none">
            {components.map(component => (
              <div
                key={component.fe_id}
                className="rounded-2xl border border-custom-bg-200 bg-white px-4 py-3 shadow-sm"
              >
                <ComponentRender component={component} />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-[260px] rounded-2xl border-2 border-dashed border-custom-bg-200 bg-white">
            <Empty description={`${emptyTitle}，${emptyDescription}`} />
          </div>
        )}
      </div>

      {footerText && (
        <div className="px-5 pb-5 text-center text-sm text-custom-text-200">{footerText}</div>
      )}
    </div>
  )
}

export default QuestionnairePreview
