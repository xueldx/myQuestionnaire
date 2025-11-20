export const buildLegacyGeneratePrompt = (theme: string, count: number) => `生成一份关于${theme}的问卷，要求如下：
1. 问卷需包含${count}个问题，每个问题都要与${theme}主题相关
2. 输出格式为JSON，结构如下：
{
  "survey": {
    "title": "问卷标题",
    "description": "问卷目的说明",
    "questions": [
      {
        "fe_id": "数字字符串，确保唯一",
        "type": "问题类型，必须是以下之一：
          - questionTitle（分段标题）
          - questionShortAnswer（简答题）
          - questionParagraph（段落题）
          - questionRadio（单选题）
          - questionCheckbox（多选题）
          - questionDropdown（下拉选择题）
          - questionRating（评分题）
          - questionNPS（NPS评分题）
          - questionMatrixRadio（矩阵单选题）
          - questionMatrixCheckbox（矩阵多选题）
          - questionSlider（滑块题）
          - questionDate（日期选择题）",
        "title": "问题标题",
        "props": {
          // 根据不同类型设置不同属性
          // 单选、多选、下拉题：options: string[]
          // 评分题：count: number
          // NPS题：min: number, max: number
          // 矩阵题：rows: string[], columns: string[]
          // 滑块题：min: number, max: number, step: number
          // 日期题：format: "YYYY-MM-DD"
        }
      }
    ]
  }
}

3. 问题类型分配建议：
- 使用questionTitle作为分段标题，合理分隔不同类型的问题
- 包含2-3个简答或段落题
- 包含4-5个单选或多选题
- 包含1-2个评分或NPS题
- 包含1-2个矩阵题
- 其他类型根据主题合理分配

4. 确保生成的JSON格式正确，每个问题的props属性符合对应类型的要求。`;

export const buildLegacyAnalysisPrompt = ({
  title,
  description,
  formattedStats,
  formattedQuestions,
}: {
  title?: string;
  description?: string;
  formattedStats: string;
  formattedQuestions: string;
}) => `
你是一位数据分析专家，请对以下问卷数据进行简要分析：

问卷标题: ${title || '未知标题'}
问卷描述: ${description || '无描述'}

数据: ${formattedStats}
问题: ${formattedQuestions}

请提供简洁的分析，包括：
1. 总体概况：回答人数、完成情况
2. 选择题分析：热门选项及比例
3. 评分题分析：平均分和中位数
4. 文本题分析：主要关键词
5. 最重要的2-3个发现
6. 1-2条具体建议

以简单JSON格式返回：
{
  "title": "分析标题",
  "overview": "整体概况简述",
  "key_insights": ["关键发现1", "关键发现2"],
  "question_analyses": [
    {
      "id": "问题ID",
      "title": "问题标题",
      "analysis": "简短分析"
    }
  ],
  "recommendations": ["建议1", "建议2"]
}

请确保分析简明扼要，直接以JSON格式输出，无需额外说明。
`.trim();
