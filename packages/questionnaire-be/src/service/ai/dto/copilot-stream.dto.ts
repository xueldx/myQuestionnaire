import { Type } from 'class-transformer';
import {
  IsArray,
  IsDefined,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { QuestionComponent } from '@/common/schemas/question-detail.schema';

export class AiChatMessageDto {
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @IsString()
  content: string;
}

export class QuestionnaireComponentDto {
  @IsString()
  fe_id: string;

  @IsString()
  type: string;

  @IsString()
  title: string;

  @IsObject()
  props: Record<string, any>;
}

export class QuestionnaireSnapshotDto {
  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsString()
  footerText: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionnaireComponentDto)
  components: QuestionnaireComponentDto[];
}

export class CopilotStreamDto {
  @IsIn(['generate', 'edit'])
  intent: 'generate' | 'edit';

  @IsOptional()
  @IsIn(['polish', 'generate'])
  generateStage?: 'polish' | 'generate';

  @IsNotEmpty()
  @IsNumber()
  questionnaireId: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  conversationId?: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  baseVersion: number;

  @IsOptional()
  @IsString()
  model?: string;

  @IsString()
  instruction: string;

  @IsOptional()
  @IsString()
  originalInstruction?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AiChatMessageDto)
  history: AiChatMessageDto[];

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => QuestionnaireSnapshotDto)
  questionnaire: QuestionnaireSnapshotDto;
}

export type QuestionnaireSnapshot = {
  title: string;
  description: string;
  footerText: string;
  components: QuestionComponent[];
};

export type QuestionnaireDraft = QuestionnaireSnapshot;

export type CopilotGenerateStage = 'polish' | 'generate';
export type CopilotWorkflowStage = CopilotGenerateStage | 'edit';
export type CopilotRuntimePhase =
  | 'polishing'
  | 'thinking'
  | 'answering'
  | 'drafting';

export type CopilotToolName =
  | 'get_questionnaire_snapshot'
  | 'get_component_catalog'
  | 'get_answer_statistics';

export type DraftSummary = {
  added: string[];
  updated: string[];
  deleted: string[];
};
