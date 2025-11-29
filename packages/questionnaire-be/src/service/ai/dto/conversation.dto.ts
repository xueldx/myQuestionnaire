import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateConversationDto {
  @IsNumber()
  @Min(1)
  questionnaireId: number;

  @IsOptional()
  @IsIn(['generate', 'edit'])
  intent?: 'generate' | 'edit';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;
}

export class UpdateConversationDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @IsOptional()
  @IsIn(['generate', 'edit'])
  intent?: 'generate' | 'edit';

  @IsOptional()
  @IsString()
  lastInstruction?: string | null;

  @IsOptional()
  @IsObject()
  latestDraft?: Record<string, any> | null;

  @IsOptional()
  @IsObject()
  latestSummary?: Record<string, any> | null;

  @IsOptional()
  @IsIn([
    'idle',
    'connecting',
    'polishing',
    'awaiting_confirmation',
    'thinking',
    'answering',
    'drafting',
    'draft_ready',
    'done',
    'cancelled',
    'error',
  ])
  lastRuntimeStatus?: string | null;

  @IsOptional()
  @IsIn(['polish', 'generate', 'edit'])
  lastWorkflowStage?: 'polish' | 'generate' | 'edit' | null;
}

export class CancelCopilotDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  requestId?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  conversationId?: number;
}
