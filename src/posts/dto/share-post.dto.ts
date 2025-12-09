import { IsOptional, IsString } from 'class-validator';

export class SharePostDto {
  @IsOptional()
  @IsString()
  namePost?: string; // tiêu đề bài share
}