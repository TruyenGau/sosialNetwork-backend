import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { InjectModel } from '@nestjs/mongoose';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import { PostDocument, Post } from './schemas/post.schemas';
import { IUser } from 'src/users/users.interface';
import mongoose, { SortOrder, Types } from 'mongoose';
import aqp from 'api-query-params';
import { Like, LikeDocument } from 'src/likes/schemas/like.schemas';
import { Comment, CommentDocument } from 'src/comments/schemas/comment.schema';
import { Community, CommunityDocument } from 'src/communities/schemas/community.schema';

@Injectable()
export class PostsService {
  constructor(
    @InjectModel(Post.name) private postModel: SoftDeleteModel<PostDocument>,
    @InjectModel(Comment.name)
    private commentModel: SoftDeleteModel<CommentDocument>,
    @InjectModel(Like.name)
    private likeModel: SoftDeleteModel<LikeDocument>,
    @InjectModel(Community.name)
    private communityModel: SoftDeleteModel<CommunityDocument>,
  ) { }

  async create(createPostDto: CreatePostDto, user: IUser) {
    const { namePost, content, userId, communityId } = createPostDto;
    const images = createPostDto.images ?? [];
    const videos = createPostDto.videos ?? [];

    if (communityId) {
      const comm = await this.communityModel.findById(communityId);
      if (!comm) throw new BadRequestException('Community không tồn tại');

      await this.communityModel.updateOne(
        { _id: communityId },
        { $inc: { postsCount: 1 } },
      );
    }

    const newPost = await this.postModel.create({
      namePost,
      content,
      images,
      videos,
      userId,
      communityId,
      createdBy: {
        _id: user._id,
        email: user.email,
      },
    });

    return newPost;
  }

  async findAll(currentPage: number, limit: number, qs: string, user: IUser) {
    const { filter, sort, population, projection } = aqp(qs);
    delete filter.current;
    delete filter.pageSize;

    const page = Math.max(Number(currentPage) || 1, 1);
    const pageSize = Math.max(Number(limit) || 10, 1);
    const skip = (page - 1) * pageSize;

    let sortObj: Record<string, SortOrder>;
    if (sort && typeof sort === 'object' && Object.keys(sort).length > 0) {
      sortObj = Object.entries(sort).reduce<Record<string, SortOrder>>(
        (acc, [k, v]) => {
          acc[k] = v as SortOrder;
          return acc;
        },
        {},
      );
    } else {
      sortObj = { createdAt: -1 as SortOrder };
    }

    const [totalItems, posts] = await Promise.all([
      this.postModel.countDocuments(filter),
      this.postModel
        .find(filter)
        .sort(sortObj)
        .skip(skip)
        .limit(pageSize)
        .populate('communityId', 'name _id')
        .populate(population)
        .select(projection as any)
        .lean(),
    ]);

    const postIds = posts.map((p) => p._id);
    const userLikes = await this.likeModel
      .find({ postId: { $in: postIds }, userId: user._id, isDeleted: false })
      .select('postId')
      .lean();

    const likedSet = new Set(userLikes.map((l) => l.postId.toString()));

    const result = posts.map((p) => ({
      ...p,
      likesCount: p.likesCount ?? 0,
      isLiked: likedSet.has(p._id.toString()),
    }));

    return {
      meta: {
        current: page,
        pageSize,
        pages: Math.ceil(totalItems / pageSize),
        total: totalItems,
      },
      result,
    };
  }

  async findOne(id: string) {
    const _id = new Types.ObjectId(String(id));

    const post = await this.postModel
      .findById(_id)
      .populate('communityId', 'name _id')
      .lean();

    if (!post || post.isDeleted) {
      throw new NotFoundException('Post không tồn tại');
    }

    // ✅ Lấy tất cả comment của post
    const comments = await this.commentModel
      .find({ postId: _id, isDeleted: { $ne: true } })
      .sort({ createdAt: 1 })
      .lean();

    // Dựng cây bình luận
    const byId = new Map<string, any>();
    for (const c of comments) {
      byId.set(String(c._id), {
        _id: c._id,
        postId: c.postId,
        userId: c.userId,
        parentId: c.parentId,
        content: c.content,
        likesCount: c.likesCount ?? 0,
        repliesCount: c.repliesCount ?? 0,
        createdBy: c.createdBy,
        updatedBy: c.updatedBy,
        children: [],
      });
    }

    const roots: any[] = [];
    for (const node of byId.values()) {
      if (node.parentId) {
        const p = byId.get(String(node.parentId));
        if (p) p.children.push(node);
        else roots.push(node);
      } else {
        roots.push(node);
      }
    }

    const sortAsc = (a: any, b: any) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    const sortDesc = (a: any, b: any) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

    const sortChildren = (list: any[]) => {
      list.sort(sortAsc);
      for (const n of list) if (n.children?.length) sortChildren(n.children);
    };
    sortChildren(roots);
    roots.sort(sortDesc);

    return {
      ...post,
      comments: roots,
    };
  }

  async update(_id: string, updatePostDto: UpdatePostDto, user: IUser) {
    if (!mongoose.Types.ObjectId.isValid(_id)) {
      throw new BadRequestException('Not found Post');
    }

    const { namePost, content } = updatePostDto;

    const updated = await this.postModel.updateOne(
      { _id },
      {
        namePost,
        content,
        updatedBy: {
          _id: user._id,
          email: user.email,
        },
      },
    );
    return updated;
  }

  async remove(id: string, user: IUser) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return 'not found post';
    }

    const post = await this.postModel.findById(id);
    if (!post) {
      throw new NotFoundException('Post không tồn tại');
    }
    await this.postModel.updateOne(
      { _id: id },
      {
        deletedBy: {
          _id: user._id,
          email: user.email,
        },
      },
    );

    if (post.communityId) {
      await this.communityModel.updateOne(
        { _id: post.communityId },
        { $inc: { postsCount: -1 } },
      );
    }

    return this.postModel.softDelete({ _id: id });
  }
}
