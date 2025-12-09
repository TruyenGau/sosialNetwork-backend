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

import { User, UserDocument } from 'src/users/schemas/user.schema';
import {
  Community,
  CommunityDocument,
} from 'src/communities/schemas/community.schema';
import { Follow, FollowDocument } from 'src/follows/schemas/follow.schemas';
import axios from 'axios';

@Injectable()
export class PostsService {
  constructor(
    @InjectModel(Post.name) private postModel: SoftDeleteModel<PostDocument>,
    @InjectModel(Comment.name)
    private commentModel: SoftDeleteModel<CommentDocument>,

    @InjectModel(Like.name) private likeModel: SoftDeleteModel<LikeDocument>,
    @InjectModel(User.name) private userModel: SoftDeleteModel<UserDocument>,
    @InjectModel(Follow.name)
    private followModel: SoftDeleteModel<FollowDocument>,

    @InjectModel(Community.name)
    private communityModel: SoftDeleteModel<CommunityDocument>,
  ) {}

  async create(createPostDto: CreatePostDto, user: IUser) {
    const { namePost, content, userId, communityId } = createPostDto;
    const images = createPostDto.images ?? [];
    const videos = createPostDto.videos ?? [];

    // =======================================
    // 🔥 1. Gọi API kiểm duyệt nội dung ML
    // =======================================
    try {
      const aiRes = await axios.post('http://127.0.0.1:5000/moderation', {
        text: content,
      });

      const toxicScore = aiRes.data.toxic;
      const threshold = 0.55;

      // Nếu bài viết độc hại → return JSON (không throw)
      if (toxicScore > threshold) {
        return {
          success: false,
          message: 'Nội dung bài Post chứa từ ngữ độc hại! Vui lòng chỉnh sửa.',
          toxicScore,
        };
      }
    } catch (error) {
      console.error('Error calling ML API:', error);

      return {
        success: false,
        message: 'Không thể kiểm duyệt nội dung lúc này!',
      };
    }

    // =======================================
    // 🔥 2. Tạo bài viết như cũ
    // =======================================
    if (communityId) {
      const comm = await this.communityModel.findById(communityId);
      if (!comm) return { success: false, message: 'Community không tồn tại' };

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

    return {
      success: true,
      post: newPost,
    };
  }

  async findAll(currentPage: number, limit: number, qs: string, user: IUser) {
    const { filter, sort, population, projection } = aqp(qs);
    delete filter.current;
    delete filter.pageSize;

    const page = Math.max(Number(currentPage) || 1, 1);
    const pageSize = Math.max(Number(limit) || 10, 1);
    const skip = (page - 1) * pageSize;

    // ⭐ lấy danh sách user mà mình follow
    const following = await this.followModel
      .find({ follower: user._id })
      .select('following')
      .lean();

    const followingIds = following.map((f) => f.following);

    // ⭐ thêm chính mình vào feed
    const feedUserIds = [...followingIds, user._id];

    // ⭐ CHỈ lấy bài của người mình follow
    filter.userId = { $in: feedUserIds };

    // ⭐ LOẠI BỎ bài viết thuộc cộng đồng (community)
    filter.$or = [{ communityId: null }, { communityId: { $exists: false } }];

    // ⭐ xử lý sort
    let sortObj: Record<string, SortOrder>;
    if (sort && typeof sort === 'object' && Object.keys(sort).length > 0) {
      sortObj = Object.entries(sort).reduce((acc, [k, v]) => {
        acc[k] = v as SortOrder;
        return acc;
      }, {});
    } else {
      sortObj = { createdAt: -1 as SortOrder };
    }

    // ⭐ chạy query song song
    const [totalItems, posts] = await Promise.all([
      this.postModel.countDocuments(filter),
      this.postModel
        .find(filter)
        .sort(sortObj)
        .skip(skip)
        .limit(pageSize)
        .populate({ path: 'userId', select: 'name avatar' })
        .populate('communityId', 'name _id') // vẫn populate nếu muốn kiểm tra
        .populate(population)
        .select(projection as any)
        .lean(),
    ]);

    // ⭐ lấy danh sách like
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

  async findAllWithGroup(
    currentPage: number,
    limit: number,
    qs: any,
    user: IUser,
    groupId: string,
  ) {
    const { filter, sort, population, projection } = aqp(qs);
    delete filter.current;
    delete filter.pageSize;

    // 👉 Thêm filter theo groupId
    if (groupId) {
      filter.communityId = groupId;
    }

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
        .populate({
          path: 'userId',
          select: 'name avatar',
        })
        .populate('communityId', 'name _id')
        .populate(population)
        .select(projection as any)
        .lean(),
    ]);

    // LIKE STATUS
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

  async findAllById(
    currentPage: number,
    limit: number,
    qs: string,
    userId: string,
  ) {
    const { filter, sort, population, projection } = aqp(qs);
    delete filter.current;
    delete filter.pageSize;

    filter.userId = userId;

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
        .populate({
          path: 'userId',
          select: 'name avatar',
        })
        .select(projection as any)
        .lean(),
    ]);

    const postIds = posts.map((p) => p._id);

    const result = posts.map((p) => ({
      ...p,
      likesCount: p.likesCount ?? 0,
      isLiked: false,
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

  async findOne(id: string, user: IUser) {
    const _id = new Types.ObjectId(String(id));

    const post = await this.postModel
      .findById(_id)
      .populate('communityId', 'name _id')
      .lean();

    if (!post || post.isDeleted) {
      throw new NotFoundException('Post không tồn tại');
    }

    // ===== CHECK USER ĐÃ LIKE POST HAY CHƯA =====
    const userLike = await this.likeModel.findOne({
      postId: _id,
      userId: user._id,
      isDeleted: false,
    });

    const author = await this.userModel
      .findById(post.userId)
      .select('avatar name')
      .lean();

    const isLiked = !!userLike;
    const likesCount = post.likesCount ?? 0;

    // ===== LẤY COMMENT =====
    const comments = await this.commentModel
      .find({ postId: _id, isDeleted: { $ne: true } })
      .sort({ createdAt: -1 })
      .lean();

    // ===== LẤY THÔNG TIN USER CỦA COMMENT =====
    const userIds = [...new Set(comments.map((c) => String(c.userId)))];

    const users = await this.userModel
      .find({ _id: { $in: userIds } })
      .select('_id avatar name')
      .lean();

    const userMap = new Map(users.map((u) => [String(u._id), u]));

    const byId = new Map<string, any>();
    for (const c of comments) {
      const u = userMap.get(String(c.userId));

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
        user: {
          avatar: u?.avatar ?? null,
          name: u?.name ?? 'Unknown',
        },
        createdAt: c.createdAt,
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
      likesCount,
      isLiked,
      comments: roots,
      author,
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
