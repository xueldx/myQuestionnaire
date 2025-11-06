import { parseCopilotBlocks } from '@/service/ai/utils/parse-copilot-blocks';

describe('parseCopilotBlocks', () => {
  it('parses page config, components and assistant reply from a complete draft', () => {
    const parsed = parseCopilotBlocks(`
<<<PAGE_CONFIG>>>
{"title":"顾客满意度问卷","description":"用于收集门店顾客反馈","footerText":"感谢填写"}
<<<END_PAGE_CONFIG>>>
<<<COMPONENT>>>
{"fe_id":"q1","type":"questionRadio","title":"你对服务是否满意？","props":{"title":"你对服务是否满意？","options":["满意","一般","不满意"]}}
<<<END_COMPONENT>>>
<<<END_DRAFT>>>
<<<ASSISTANT_REPLY>>>
本轮已生成一份顾客满意度问卷草稿。
<<<END_ASSISTANT_REPLY>>>
`);

    expect(parsed.pageConfig).toEqual({
      title: '顾客满意度问卷',
      description: '用于收集门店顾客反馈',
      footerText: '感谢填写',
    });
    expect(parsed.components).toHaveLength(1);
    expect(parsed.components[0].fe_id).toBe('q1');
    expect(parsed.assistantReply).toContain('顾客满意度问卷草稿');
    expect(parsed.endDraftReached).toBe(true);
    expect(parsed.errors).toEqual([]);
    expect(parsed.warnings).toEqual([]);
  });

  it('downgrades bad component json into warnings without breaking parsed blocks', () => {
    const parsed = parseCopilotBlocks(`
<<<PAGE_CONFIG>>>
{"title":"测试问卷","description":"测试","footerText":""}
<<<END_PAGE_CONFIG>>>
<<<COMPONENT>>>
{"fe_id":"q1","type":"questionRadio","title":"第一题","props":{"title":"第一题","options":["A","B"]}}
<<<END_COMPONENT>>>
<<<COMPONENT>>>
{"fe_id":"broken","type":"questionRadio"
<<<END_COMPONENT>>>
<<<END_DRAFT>>>
`);

    expect(parsed.components).toHaveLength(1);
    expect(parsed.components[0].fe_id).toBe('q1');
    expect(parsed.warnings).toHaveLength(1);
    expect(parsed.warnings[0]).toContain('JSON 解析失败');
    expect(parsed.errors).toEqual([]);
  });

  it('reports invalid page config as an error', () => {
    const parsed = parseCopilotBlocks(`
<<<PAGE_CONFIG>>>
{"title":"测试问卷"
<<<END_PAGE_CONFIG>>>
<<<END_DRAFT>>>
`);

    expect(parsed.pageConfig).toBeNull();
    expect(parsed.errors).toContain('PAGE_CONFIG JSON 解析失败');
  });
});
