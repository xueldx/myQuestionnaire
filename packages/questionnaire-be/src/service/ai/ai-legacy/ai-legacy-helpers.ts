import OpenAI from 'openai';
import { Observable } from 'rxjs';
import { AnswerService } from '@/service/answer/answer.service';
import { EditorService } from '@/service/editor/editor.service';
import {
  buildLegacyAnalysisPrompt,
  buildLegacyGeneratePrompt,
} from '@/service/ai/ai-legacy/ai-legacy-prompts';

type ModelRuntimeConfig = {
  model: string;
  apiKey: string;
  baseURL: string;
};

type ResolveModelSelection = (modelName?: string) => {
  key: string;
  config: ModelRuntimeConfig;
};

type LegacyDeps = {
  answerService: AnswerService;
  editorService: EditorService;
  openai: OpenAI;
  defaultModel: string;
  resolveModelSelection: ResolveModelSelection;
  createClientForModel: (modelName: string) => OpenAI;
};

const resolveClient = (deps: LegacyDeps, modelName?: string) => {
  const resolvedModel = deps.resolveModelSelection(modelName);
  const client =
    resolvedModel.key === deps.defaultModel
      ? deps.openai
      : deps.createClientForModel(resolvedModel.key);

  return {
    client,
    resolvedModel,
  };
};

const createStreamingObservable = (
  client: OpenAI,
  model: string,
  messages: Array<{ role: 'system' | 'user'; content: string }>,
  errorMessage: string,
): Observable<MessageEvent> =>
  new Observable((subscriber) => {
    let accumulatedContent = '';
    const abortController = new AbortController();

    client.chat.completions
      .create(
        {
          messages,
          model,
          stream: true,
        },
        {
          signal: abortController.signal,
        },
      )
      .then(async (stream) => {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0].delta.content || '';
            accumulatedContent += content;
            subscriber.next({ data: accumulatedContent } as MessageEvent);
            if (subscriber.closed) {
              abortController.abort();
            }
          }
          subscriber.next({ data: '{[DONE]}' } as MessageEvent);
        } catch (error) {
          subscriber.error(error);
        }
      })
      .catch((error) => {
        console.error(errorMessage, error);
        subscriber.error(new Error(errorMessage));
      });

    return () => {
      abortController.abort();
      subscriber.complete();
    };
  });

export const generate = async (
  deps: LegacyDeps,
  theme: string,
  count: number,
  modelName?: string,
): Promise<Observable<MessageEvent>> => {
  const { client, resolvedModel } = resolveClient(deps, modelName);

  return createStreamingObservable(
    client,
    resolvedModel.config.model,
    [
      {
        role: 'system',
        content: '你是一个专业的问卷设计专家，请根据用户的需求生成问卷。',
      },
      { role: 'user', content: buildLegacyGeneratePrompt(theme, count) },
    ],
    '生成问卷时出错，请稍后重试。',
  );
};

export const extractOptionsFromComponent = (component: any): any => {
  if (!component || !component.props) return null;

  if (
    ['questionRadio', 'questionCheckbox', 'questionDropdown'].includes(
      component.type,
    ) &&
    Array.isArray(component.props.options)
  ) {
    return component.props.options.map((opt) => ({
      text: opt,
      value: opt,
    }));
  }

  if (
    ['questionRating', 'questionNPS'].includes(component.type) &&
    component.props.count
  ) {
    const count = parseInt(component.props.count) || 5;
    return Array.from({ length: count }, (_, i) => ({
      text: String(i + 1),
      value: String(i + 1),
    }));
  }

  if (
    ['questionMatrixRadio', 'questionMatrixCheckbox'].includes(component.type)
  ) {
    return {
      rows: component.props.rows || [],
      columns: component.props.columns || [],
    };
  }

  return null;
};

export const getEnhancedStats = async (deps: LegacyDeps, id: number) => {
  const statsData = await deps.answerService.getAnswersByQuestionId(id);
  const questionDetail = await deps.editorService.getQuestionnaireDetail(
    id.toString(),
  );

  if (questionDetail && questionDetail.components) {
    const enhancedStats = statsData.map((statItem) => {
      const component = questionDetail.components.find(
        (comp) => String(comp.fe_id) === String(statItem.questionId),
      );

      if (component && component.props) {
        return {
          ...statItem,
          question: component.props.title || `问题${statItem.questionId}`,
          componentInfo: {
            title: component.title,
            type: component.type,
            props: component.props,
            options: extractOptionsFromComponent(component),
          },
        };
      }

      return statItem;
    });

    return {
      title: questionDetail.title,
      description: questionDetail.description,
      stats: enhancedStats,
    };
  }
};

export const analysis = async (
  deps: LegacyDeps,
  questionnaireId: number,
  modelName?: string,
): Promise<Observable<MessageEvent>> => {
  const { client, resolvedModel } = resolveClient(deps, modelName);
  const statsData =
    await deps.answerService.getAnswersByQuestionId(questionnaireId);
  const questionnaireDetail = await deps.editorService.getQuestionnaireDetail(
    questionnaireId.toString(),
  );

  const formattedStats =
    statsData && statsData.length > 0
      ? JSON.stringify(statsData)
      : '暂无问卷统计数据';
  const formattedQuestions =
    questionnaireDetail && questionnaireDetail.components
      ? JSON.stringify(questionnaireDetail.components)
      : '暂无问题数据';

  return createStreamingObservable(
    client,
    resolvedModel.config.model,
    [
      {
        role: 'system',
        content: '你是一位数据分析专家，请根据用户提供的问卷数据进行分析。',
      },
      {
        role: 'user',
        content: buildLegacyAnalysisPrompt({
          title: questionnaireDetail?.title,
          description: questionnaireDetail?.description,
          formattedStats,
          formattedQuestions,
        }),
      },
    ],
    '生成分析报告时出错，请稍后重试。',
  );
};
