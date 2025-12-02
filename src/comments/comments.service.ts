import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Comment, CommentDocument } from './schemas/comment.schema';
import { Post, PostDocument } from 'src/posts/schemas/post.schemas';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import { IUser } from 'src/users/users.interface';
import { Types } from 'mongoose';
import { NotificationsService } from 'src/notifications/notifications.service';

@Injectable()
export class CommentsService {
  constructor(
    @InjectModel(Comment.name)
    private readonly commentModel: SoftDeleteModel<CommentDocument>,
    @InjectModel(Post.name)
    private readonly postModel: SoftDeleteModel<PostDocument>,
    private notificationsService: NotificationsService,
  ) {}

  async create(dto: CreateCommentDto, user: IUser) {
    const postObjectId = new Types.ObjectId(String(dto.postId));
    const userObjectId = new Types.ObjectId(String(user._id));
    const parentObjectId = dto.parentId
      ? new Types.ObjectId(String(dto.parentId))
      : null;

    const post = await this.postModel.findById(postObjectId).lean();
    if (!post) throw new NotFoundException('Post không tồn tại');

    const session = await this.commentModel.db.startSession();
    session.startTransaction();

    try {
      const [created] = await this.commentModel.create(
        [
          {
            postId: postObjectId,
            userId: userObjectId,
            parentId: parentObjectId,
            content: dto.content,
            likesCount: 0,
            repliesCount: 0,
            isDeleted: false,
            createdBy: { _id: userObjectId, email: user.email },
            updatedBy: { _id: userObjectId, email: user.email },
          },
        ],
        { session },
      );

      await this.postModel.updateOne(
        { _id: postObjectId },
        { $inc: { commentsCount: 1 } },
        { session },
      );

      if (parentObjectId) {
        const parent = await this.commentModel
          .findById(parentObjectId)
          .session(session);
        if (!parent) throw new NotFoundException('Comment cha không tồn tại');

        await this.commentModel.updateOne(
          { _id: parentObjectId },
          { $inc: { repliesCount: 1 } },
          { session },
        );
      }

      await session.commitTransaction();

      // ⭐⭐ TẠO THÔNG BÁO (không gửi nếu tự comment bài của mình)
      if (String(post.userId) !== String(user._id)) {
        await this.notificationsService.createNotification({
          userId: new Types.ObjectId(String(post.userId)),
          fromUserId: new Types.ObjectId(String(user._id)),
          postId: postObjectId,
          type: 'COMMENT',
        });
      }

      return created;
    } catch (e) {
      await session.abortTransaction();
      throw e;
    } finally {
      session.endSession();
    }
  }

  findAll() {
    return `This action returns all comments`;
  }

  findOne(id: number) {
    return `This action returns a #${id} comment`;
  }

  async update(
    commentId: string,
    updateCommentDto: UpdateCommentDto,
    user: IUser,
  ) {
    const c = await this.commentModel.findById(commentId);
    if (!c) throw new NotFoundException('Comment không tồn tại');
    if (c.isDeleted) throw new ForbiddenException('Comment đã bị xoá');
    if (String(c.userId) !== String(user._id)) {
      throw new ForbiddenException('Bạn không có quyền sửa comment này');
    }
    const { content } = updateCommentDto;
    const updated = await this.commentModel.updateOne(
      {
        _id: commentId,
      },
      {
        content,
      },
      {
        updatedBy: {
          _id: user._id,
          email: user.email,
        },
      },
    );

    return updated;
  }

  async remove(commentId: string, user: IUser) {
    const c = await this.commentModel.findById(commentId);
    if (!c) throw new NotFoundException('Comment không tồn tại');

    const post = await this.postModel.findById(c.postId).lean();
    if (!post) throw new NotFoundException('Post không tồn tại');

    const isCommentOwner = String(c.userId) === String(user._id);
    const isPostOwner = String(post.userId) === String(user._id);
    if (!isCommentOwner && !isPostOwner) {
      throw new ForbiddenException(
        'Chỉ chủ comment hoặc chủ post mới được xoá comment này',
      );
    }

    if (c.isDeleted) return { success: true, affected: 0 };

    const session = await this.commentModel.db.startSession();
    session.startTransaction();
    try {
      // Lấy toàn bộ descendants của comment
      const graph = await this.commentModel
        .aggregate([
          { $match: { _id: new Types.ObjectId(commentId) } },
          {
            $graphLookup: {
              from: this.commentModel.collection.name,
              startWith: '$_id',
              connectFromField: '_id',
              connectToField: 'parentId',
              as: 'descendants',
            },
          },
          {
            $project: {
              root: '$_id',
              descendants: {
                $filter: {
                  input: '$descendants',
                  as: 'd',
                  cond: { $ne: ['$$d.isDeleted', true] },
                },
              },
            },
          },
        ])
        .session(session);

      const descendants = graph?.[0]?.descendants || [];
      const ids = [
        c._id,
        ...descendants.map((d: any) => d._id as Types.ObjectId),
      ];

      // Đếm số node chưa xoá để trừ Post.commentsCount
      const notDeletedCount = await this.commentModel
        .countDocuments({
          _id: { $in: ids },
          isDeleted: { $ne: true },
        })
        .session(session);

      // Xoá mềm tất cả
      await this.commentModel.updateMany(
        { _id: { $in: ids } },
        {
          $set: {
            isDeleted: true,
            deletedAt: new Date(),
            deletedBy: {
              _id: new Types.ObjectId(String(user._id)),
              email: user.email,
            },
          },
        },
        { session },
      );

      // Nếu xoá 1 reply -> giảm repliesCount của parent -1
      if (c.parentId) {
        await this.commentModel.updateOne(
          { _id: c.parentId },
          { $inc: { repliesCount: -1 } },
          { session },
        );
      }

      // Giảm tổng commentsCount của Post
      if (notDeletedCount > 0) {
        await this.postModel.updateOne(
          { _id: c.postId },
          { $inc: { commentsCount: -notDeletedCount } },
          { session },
        );
      }

      await session.commitTransaction();
      return { success: true, affected: notDeletedCount };
    } catch (e) {
      await session.abortTransaction();
      throw e;
    } finally {
      session.endSession();
    }
  }
}
