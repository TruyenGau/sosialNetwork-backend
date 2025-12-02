import { Module } from '@nestjs/common';
import { LikesService } from './likes.service';
import { LikesController } from './likes.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Post, PostSchema } from 'src/posts/schemas/post.schemas';
import { Like, LikeSchema } from './schemas/like.schemas';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Post.name, schema: PostSchema },
      { name: Like.name, schema: LikeSchema },
    ]),
    NotificationsModule,
  ],
  controllers: [LikesController],
  providers: [LikesService],
})
export class LikesModule {}
