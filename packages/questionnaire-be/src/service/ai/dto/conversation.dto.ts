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
}
