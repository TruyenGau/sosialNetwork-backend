import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { SortOrder } from 'mongoose';
import aqp from 'api-query-params';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import { Community, CommunityDocument } from './schemas/community.schema';
import { CreateCommunityDto } from './dto/create-community.dto';
import { UpdateCommunityDto } from './dto/update-community.dto';
import { IUser } from 'src/users/users.interface';
import { Post, PostDocument } from 'src/posts/schemas/post.schemas';
import { User, UserDocument } from 'src/users/schemas/user.schema';

@Injectable()
export class CommunitiesService {
  constructor(
    @InjectModel(Community.name)
    private communityModel: SoftDeleteModel<CommunityDocument>,
    @InjectModel(Post.name) private postModel: SoftDeleteModel<PostDocument>,
    @InjectModel(User.name) private userModel: SoftDeleteModel<UserDocument>,
  ) {}

  async create(dto: CreateCommunityDto, user: IUser) {
    const exist = await this.communityModel.findOne({ name: dto.name });
    if (exist)
      throw new BadRequestException(`Community ${dto.name} đã tồn tại`);

    const userId = new mongoose.Types.ObjectId(user._id);
    const newCommunity = await this.communityModel.create({
      name: dto.name,
      description: dto.description,
      avatar: dto.avatar,
      admins: [userId],
      members: [userId],
      membersCount: 1,
      createdBy: { _id: user._id, email: user.email },
    });

    await this.userModel.updateOne(
      { _id: userId },
      { $addToSet: { communities: newCommunity._id } },
    );

    return newCommunity;
  }

  async findAll(currentPage = 1, limit = 10, qs = '') {
    const { filter, sort, population, projection } = aqp(qs);
    delete filter.current;
    delete filter.pageSize;

    const page = Math.max(Number(currentPage) || 1, 1);
    const pageSize = Math.max(Number(limit) || 10, 1);
    const skip = (page - 1) * pageSize;

    const [totalItems, result] = await Promise.all([
      this.communityModel.countDocuments(filter),
      this.communityModel
        .find(filter)
        .sort((sort as Record<string, SortOrder>) ?? { createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .populate(population)
        .select(projection as any)
        .lean(),
    ]);

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
    if (!mongoose.Types.ObjectId.isValid(id))
      throw new BadRequestException('Community id không hợp lệ');
    const comm = await this.communityModel
      .findById(id)
      .populate([
        { path: 'members', select: 'name email avatar' },
        { path: 'admins', select: 'name email avatar' },
      ])
      .lean();

    if (!comm) throw new NotFoundException('Community không tồn tại');

    const posts = await this.postModel
      .find({ communityId: id, isDeleted: { $ne: true } })
      .sort({ createdAt: -1 })
      .select(
        'namePost content images videos likesCount commentsCount createdAt userId',
      )
      .lean();

    return { ...comm, posts };
  }

  async update(id: string, dto: UpdateCommunityDto, user: IUser) {
    if (!mongoose.Types.ObjectId.isValid(id))
      throw new BadRequestException('Community id không hợp lệ');

    const community = await this.communityModel.findById(id);
    if (!community) throw new NotFoundException('Community không tồn tại');

    const isOwner = community.createdBy._id.toString() === user._id.toString();
    const isAdmin =
      user.role?.name === 'ADMIN' || user.role?.name === 'SUPER_ADMIN';

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('Bạn không có quyền sửa community này');
    }

    await this.communityModel.updateOne(
      { _id: id },
      {
        ...dto,
        updatedBy: { _id: user._id, email: user.email },
        updatedAt: new Date(),
      },
    );
    return this.communityModel.findById(id);
  }

  async remove(id: string, user: IUser) {
    if (!mongoose.Types.ObjectId.isValid(id))
      throw new BadRequestException('Community id không hợp lệ');
    const comm = await this.communityModel.findById(id);
    if (!comm) throw new NotFoundException('Community không tồn tại');

    if (!comm.admins.map(String).includes(String(user._id))) {
      throw new ForbiddenException('Bạn không có quyền xóa community này');
    }

    await this.communityModel.updateOne(
      { _id: id },
      { deletedBy: { _id: user._id, email: user.email } },
    );
    return this.communityModel.softDelete({ _id: id });
  }

  async join(id: string, user: IUser) {
    if (!mongoose.Types.ObjectId.isValid(id))
      throw new BadRequestException('Community id không hợp lệ');
    const comm = await this.communityModel.findById(id);
    if (!comm) throw new NotFoundException('Community không tồn tại');

    const uid = new mongoose.Types.ObjectId(user._id);
    if (comm.members.some((m) => m.toString() === user._id.toString())) {
      return { message: 'Bạn đã là thành viên' };
    }

    comm.members.push(uid as any);
    comm.membersCount = (comm.membersCount || 0) + 1;
    await comm.save();

    await this.userModel.updateOne(
      { _id: uid },
      { $addToSet: { communities: comm._id } },
    );
    return { ok: 1, message: 'Đã tham gia cộng đồng' };
  }

  async leave(id: string, user: IUser) {
    if (!mongoose.Types.ObjectId.isValid(id))
      throw new BadRequestException('Community id không hợp lệ');
    const comm = await this.communityModel.findById(id);
    if (!comm) throw new NotFoundException('Community không tồn tại');

    if (
      comm.admins.length === 1 &&
      comm.admins[0].toString() === user._id.toString()
    ) {
      throw new BadRequestException(
        'Bạn là admin duy nhất, không thể rời khỏi community',
      );
    }

    comm.members = comm.members.filter(
      (m) => m.toString() !== user._id.toString(),
    );
    comm.admins = comm.admins.filter(
      (a) => a.toString() !== user._id.toString(),
    );
    comm.membersCount = Math.max((comm.membersCount || 1) - 1, 0);
    await comm.save();

    await this.userModel.updateOne(
      { _id: user._id },
      { $pull: { communities: comm._id } },
    );

    return { ok: 1, message: 'Đã rời khỏi community' };
  }

  async removeMember(communityId: string, memberId: string, requester: IUser) {
    if (
      !mongoose.Types.ObjectId.isValid(communityId) ||
      !mongoose.Types.ObjectId.isValid(memberId)
    )
      throw new BadRequestException('Id không hợp lệ');

    const comm = await this.communityModel.findById(communityId);
    if (!comm) throw new NotFoundException('Community không tồn tại');

    if (!comm.admins.map(String).includes(String(requester._id))) {
      throw new ForbiddenException('Bạn không có quyền xóa thành viên');
    }

    comm.members = comm.members.filter((m) => m.toString() !== memberId);
    comm.admins = comm.admins.filter((a) => a.toString() !== memberId);
    comm.membersCount = Math.max((comm.membersCount || 1) - 1, 0);
    await comm.save();

    await this.userModel.updateOne(
      { _id: memberId },
      { $pull: { communities: comm._id } },
    );
    return { ok: 1, message: 'Đã xóa thành viên khỏi community' };
  }

  async removePost(communityId: string, postId: string, requester: IUser) {
    if (
      !mongoose.Types.ObjectId.isValid(communityId) ||
      !mongoose.Types.ObjectId.isValid(postId)
    )
      throw new BadRequestException('Id không hợp lệ');

    const comm = await this.communityModel.findById(communityId);
    if (!comm) throw new NotFoundException('Community không tồn tại');

    const post = await this.postModel.findById(postId);
    if (!post) throw new NotFoundException('Post không tồn tại');

    if (
      !comm.admins.map(String).includes(String(requester._id)) &&
      post.userId.toString() !== requester._id.toString()
    ) {
      throw new ForbiddenException('Bạn không có quyền xóa bài viết này');
    }

    await this.postModel.softDelete({ _id: postId });
    return { ok: 1, message: 'Đã xóa bài viết' };
  }

  async getMembers(id: string, current = 1, pageSize = 20) {
    if (!mongoose.Types.ObjectId.isValid(id))
      throw new BadRequestException('Community id không hợp lệ');
    const comm = await this.communityModel
      .findById(id)
      .populate({ path: 'members', select: 'name email avatar' })
      .lean();
    if (!comm) throw new NotFoundException('Community không tồn tại');

    const start = (current - 1) * pageSize;
    const items = (comm.members || []).slice(start, start + pageSize);
    return {
      meta: {
        current,
        pageSize,
        total: comm.members.length,
        pages: Math.ceil(comm.members.length / pageSize),
      },
      result: items,
    };
  }

  async addMember(communityId: string, memberId: string, requester: IUser) {
    if (
      !mongoose.Types.ObjectId.isValid(communityId) ||
      !mongoose.Types.ObjectId.isValid(memberId)
    )
      throw new BadRequestException('Id không hợp lệ');

    const comm = await this.communityModel.findById(communityId);
    if (!comm) throw new NotFoundException('Community không tồn tại');

    if (!comm.admins.map(String).includes(String(requester._id))) {
      throw new BadRequestException('Bạn không có quyền thêm thành viên');
    }

    const added = await this.communityModel.updateOne(
      { _id: communityId },
      { $addToSet: { members: memberId }, $inc: { membersCount: 1 } },
    );
    await this.userModel.updateOne(
      { _id: memberId },
      { $addToSet: { communities: comm._id } },
    );
    return added;
  }
}
