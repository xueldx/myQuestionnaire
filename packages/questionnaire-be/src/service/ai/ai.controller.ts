import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  Sse,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AiService } from '@/service/ai/ai.service';
import { Public } from '@/common/decorators/public.decorator';
import { Observable } from 'rxjs';
import { ResponseBody } from '@/common/classes/response-body';
import { CopilotStreamDto } from '@/service/ai/dto/copilot-stream.dto';
import {
  currentUser,
  UserToken,
} from '@/common/decorators/current-user.decorator';
import {
  CancelCopilotDto,
  CreateConversationDto,
  UpdateConversationDto,
} from '@/service/ai/dto/conversation.dto';
import {
  AiMetricsQueryDto,
  AiMetricTimeseriesQueryDto,
  UpdateAiMetricOutcomeDto,
} from '@/service/ai/dto/metrics.dto';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Public()
  @Sse('generate')
  generate(
    @Query('theme') theme: string,
    @Query('count') count: number,
    @Query('model') model: string,
  ): Promise<Observable<MessageEvent>> {
    return this.aiService.generate(theme, count || 10, model);
  }

  @Public()
  @Sse('analysis')
  analysis(
    @Query('questionnaire_id') questionnaire_id: number,
    @Query('model') model: string,
  ): Promise<Observable<MessageEvent>> {
    return this.aiService.analysis(questionnaire_id, model);
  }

  @Public()
  @Get('models')
  getAvailableModels(): ResponseBody<any> {
    const models = this.aiService.getAvailableModels();
    return new ResponseBody(1, models, '获取模型列表成功');
  }

  @Get('conversations')
  async getConversations(
    @Query('questionnaireId') questionnaireId: string,
    @currentUser() user: UserToken,
  ) {
    const data = await this.aiService.listConversations(
      Number(questionnaireId),
      user.userId,
    );
    return new ResponseBody(1, data, '获取会话列表成功');
  }

  @Post('conversations')
  async createConversation(
    @Body() dto: CreateConversationDto,
    @currentUser() user: UserToken,
  ) {
    const data = await this.aiService.createConversation(dto, user.userId);
    return new ResponseBody(1, data, '创建会话成功');
  }

  @Get('conversations/:id')
  async getConversationDetail(
    @Param('id', ParseIntPipe) id: number,
    @currentUser() user: UserToken,
  ) {
    const data = await this.aiService.getConversationDetail(id, user.userId);
    return new ResponseBody(1, data, '获取会话详情成功');
  }

  @Patch('conversations/:id')
  async updateConversation(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateConversationDto,
    @currentUser() user: UserToken,
  ) {
    const data = await this.aiService.updateConversation(id, dto, user.userId);
    return new ResponseBody(1, data, '更新会话成功');
  }

  @Delete('conversations/:id')
  async deleteConversation(
    @Param('id', ParseIntPipe) id: number,
    @currentUser() user: UserToken,
  ) {
    await this.aiService.deleteConversation(id, user.userId);
    return new ResponseBody(1, null, '删除会话成功');
  }

  @Post('copilot/stream')
  async copilotStream(
    @Body() dto: CopilotStreamDto,
    @Req() req: Request,
    @Res() res: Response,
    @currentUser() user: UserToken,
  ) {
    await this.aiService.streamCopilot(dto, user, req, res);
  }

  @Post('copilot/cancel')
  async cancelCopilot(
    @Body() dto: CancelCopilotDto,
    @currentUser() user: UserToken,
  ) {
    const data = await this.aiService.cancelCopilot(dto, user);
    return new ResponseBody(
      1,
      data,
      data.cancelled ? '取消成功' : '未找到进行中的会话',
    );
  }

  @Post('metrics/:requestId/outcome')
  async updateMetricOutcome(
    @Param('requestId') requestId: string,
    @Body() dto: UpdateAiMetricOutcomeDto,
    @currentUser() user: UserToken,
  ) {
    const updated = await this.aiService.updateMetricOutcome(
      requestId,
      dto,
      user.userId,
    );
    return new ResponseBody(1, { updated }, '更新埋点结果成功');
  }

  @Get('metrics/summary')
  async getMetricSummary(
    @Query() query: AiMetricsQueryDto,
    @currentUser() user: UserToken,
  ) {
    const data = await this.aiService.getMetricSummary(query, user.userId);
    return new ResponseBody(1, data, '获取埋点汇总成功');
  }

  @Get('metrics/timeseries')
  async getMetricTimeseries(
    @Query() query: AiMetricTimeseriesQueryDto,
    @currentUser() user: UserToken,
  ) {
    const data = await this.aiService.getMetricTimeseries(query, user.userId);
    return new ResponseBody(1, data, '获取埋点趋势成功');
  }
}
