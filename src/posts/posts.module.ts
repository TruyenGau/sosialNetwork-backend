import { Module } from '@nestjs/common';
import { PostsService } from './posts.service';
import { PostsController } from './posts.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { PostSchema, Post } from './schemas/post.schemas';
import { Like, LikeSchema } from 'src/likes/schemas/like.schemas';
import { Comment, CommentSchema } from 'src/comments/schemas/comment.schema';

import { User, UserSchema } from 'src/users/schemas/user.schema';
import { Community, CommunitySchema } from 'src/communities/schemas/community.schema';


@Module({
  imports: [
    MongooseModule.forFeature([{ name: Post.name, schema: PostSchema }]),
    MongooseModule.forFeature([{ name: Like.name, schema: LikeSchema }]),
    MongooseModule.forFeature([{ name: Comment.name, schema: CommentSchema }]),

    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    MongooseModule.forFeature([{ name: Community.name, schema: CommunitySchema }]),

  ],
  controllers: [PostsController],
  providers: [PostsService],
})
export class PostsModule { }
