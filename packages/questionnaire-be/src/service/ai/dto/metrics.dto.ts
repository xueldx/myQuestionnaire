import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateAiMetricOutcomeDto {
  @IsOptional()
  @IsBoolean()
  draftApplied?: boolean;

  @IsOptional()
  @IsBoolean()
  discarded?: boolean;

  @IsOptional()
  @IsBoolean()
  autoSaveSucceeded?: boolean;

  @IsOptional()
  @IsBoolean()
  autoSaveFailed?: boolean;
}

export class AiMetricsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  questionnaireId?: number;

  @IsDateString()
  from: string;

  @IsDateString()
  to: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  contextStrategy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  modelKey?: string;
}

export class AiMetricTimeseriesQueryDto extends AiMetricsQueryDto {
  @IsOptional()
  @IsIn(['day', 'hour'])
  bucket?: 'day' | 'hour';
}
