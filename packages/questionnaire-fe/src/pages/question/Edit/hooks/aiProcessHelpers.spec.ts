import {
  getProcessSummary,
  getToolProcessStep,
  inferHistoryProcessScenario,
  resolveProcessScenario,
  sortProcessSteps
} from '@/pages/question/Edit/hooks/aiProcessHelpers'

describe('aiProcessHelpers', () => {
  it('returns polish summary for completed prompt refinement', () => {
    expect(getProcessSummary('polish', 'done')).toBe('已完成输入润色')
  })

  it('maps edit constraint tool to user-facing evidence-based wording', () => {
    expect(getToolProcessStep('edit', 'get_component_catalog')).toEqual({
      id: 'constraints',
      label: '检查题型约束'
    })
  })

  it('infers polish history from the surrounding user message', () => {
    const scenario = inferHistoryProcessScenario({
      requestIntent: 'generate',
      previousMessage: {
        role: 'user',
        kind: 'chat',
        content: '润色：请把这段需求整理得更适合生成问卷'
      },
      nextMessage: {
        role: 'assistant',
        kind: 'chat',
        content: 'Prompt 润色完成，已回填到输入框，可继续编辑或直接发送。'
      }
    })

    expect(scenario).toBe('polish')
  })

  it('resolves generate and edit scenarios directly from the request intent', () => {
    expect(resolveProcessScenario('generate')).toBe('generate')
    expect(resolveProcessScenario('edit')).toBe('edit')
  })

  it('sorts polish tool steps before the polish phase step', () => {
    const sortedSteps = sortProcessSteps([
      {
        id: 'polishing',
        label: '润色输入内容',
        status: 'done'
      },
      {
        id: 'constraints',
        label: '提取题型约束',
        status: 'done'
      },
      {
        id: 'snapshot',
        label: '读取当前问卷背景',
        status: 'done'
      }
    ])

    expect(sortedSteps.map(step => step.id)).toEqual(['snapshot', 'constraints', 'polishing'])
  })
})
