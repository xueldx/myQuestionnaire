import { IsOptional, IsString } from 'class-validator';

class UpdateQuestionDto {
  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  title?: string;
}

export default UpdateQuestionDto;
