// src/files/files.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  HttpStatus,
} from '@nestjs/common';
import { FilesService } from './files.service';
import { UpdateFileDto } from './dto/update-file.dto';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ResponseMessage } from 'src/auth/decorator/customize';
import { ApiTags } from '@nestjs/swagger';
import * as fs from 'fs';
import { ModerationService } from './moderation.service';
@ApiTags('file')
@Controller('files')
export class FilesController {
  constructor(
    private readonly filesService: FilesService,
    private readonly moderationService: ModerationService,
  ) {}

  // --- Single (giữ nguyên, nhưng mình trả về theo đúng loại) ---
  @ResponseMessage('upload single file')
  @Post('upload')
  @UseInterceptors(FileInterceptor('fileUpload'))
  uploadFile(@UploadedFile() file: Express.Multer.File) {
    const isImage = file.mimetype.startsWith('image/');
    const isVideo = file.mimetype.startsWith('video/');

    return {
      images: isImage ? [file.filename] : [],
      videos: isVideo ? [file.filename] : [],
    };
  }

  // --- Multi (1..N ảnh/video, trộn lẫn) ---
  @ResponseMessage('upload media (images/videos)')
  @Post('upload-media')
  @UseInterceptors(FilesInterceptor('media', 20)) // field name: media
  uploadMedia(@UploadedFiles() files: Express.Multer.File[]) {
    const images: string[] = [];
    const videos: string[] = [];

    (files ?? []).forEach((f) => {
      if (f.mimetype.startsWith('image/')) images.push(f.filename);
      else if (f.mimetype.startsWith('video/')) videos.push(f.filename);
    });

    return { images, videos };
  }

  // --- Các API mẫu còn lại ---
  @Get()
  findAll() {
    return this.filesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.filesService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateFileDto: UpdateFileDto) {
    return this.filesService.update(+id, updateFileDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.filesService.remove(+id);
  }

  @Post('upload-check')
  @UseInterceptors(FileInterceptor('fileUpload'))
  async uploadCheck(@UploadedFile() file: Express.Multer.File) {
    const isImage = file.mimetype.startsWith('image/');

    // Nếu là ảnh thì kiểm duyệt
    if (isImage) {
      const result = await this.moderationService.checkImage(
        file.path,
        file.filename,
      );

      if (!result.is_safe) {
        // ❌ Xóa ảnh khỏi ổ đĩa
        fs.unlinkSync(file.path);

        return {
          success: false,
          message: 'Ảnh không hợp lệ theo tiêu chuẩn cộng đồng!',
          unsafe_score: result.unsafe_score,
        };
      }
    }

    // Nếu ảnh hợp lệ hoặc là video → trả filename như bình thường
    return {
      success: true,
      filename: file.filename,
      type: isImage ? 'image' : 'video',
    };
  }
}
