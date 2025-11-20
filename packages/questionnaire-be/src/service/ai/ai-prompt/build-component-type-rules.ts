export const buildComponentTypeRules = () =>
  [
    'questionTitle: 分段标题',
    'questionShortAnswer: 简答题/文本输入',
    'questionParagraph: 段落说明',
    'questionRadio: 单选题（options 必须是 string[]）',
    'questionCheckbox: 多选题（options 必须是 string[]）',
    'questionDropdown: 下拉题（options 必须是 string[]）',
    'questionRating: 星级评分题',
    'questionNPS: NPS 评分题',
    'questionMatrixRadio: 矩阵单选题（rows/columns 必须是 string[]）',
    'questionMatrixCheckbox: 矩阵多选题（rows/columns 必须是 string[]）',
    'questionSlider: 滑块题',
    'questionDate: 日期题',
  ].join('\n');
