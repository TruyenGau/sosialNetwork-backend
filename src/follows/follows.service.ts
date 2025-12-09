import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Follow } from './schemas/follow.schemas';
import { User } from 'src/users/schemas/user.schema';
import { Model } from 'mongoose';

@Injectable()
export class FollowService {
  constructor(
    @InjectModel(Follow.name) private followModel: Model<Follow>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) { }

  // FOLLOW
  async follow(followerId: string, followingId: string) {
    if (followerId === followingId) {
      throw new BadRequestException('Không thể tự follow chính mình');
    }

    const existed = await this.followModel.findOne({
      follower: followerId,
      following: followingId,
    });
    if (existed) {
      throw new BadRequestException('Bạn đã follow người này');
    }

    await this.followModel.create({
      follower: followerId,
      following: followingId,
    });

    // Tăng đếm
    await this.userModel.findByIdAndUpdate(followerId, {
      $inc: { followingCount: 1 },
    });
    await this.userModel.findByIdAndUpdate(followingId, {
      $inc: { followersCount: 1 },
    });

    return { message: 'Follow thành công' };
  }

  // UNFOLLOW
  async unfollow(followerId: string, followingId: string) {
    const deleted = await this.followModel.findOneAndDelete({
      follower: followerId,
      following: followingId,
    });

    if (!deleted) return;

    await this.userModel.findByIdAndUpdate(followerId, {
      $inc: { followingCount: -1 },
    });
    await this.userModel.findByIdAndUpdate(followingId, {
      $inc: { followersCount: -1 },
    });
    return { message: 'UnFollow thành công' };
  }

  // Lấy danh sách tôi đang follow
  async getFollowing(userId: string) {
    return this.followModel
      .find({ follower: userId })
      .populate('following', 'name avatar online');
  }

  // Lấy danh sách người đang follow tôi
  async getFollowers(userId: string) {
    return this.followModel
      .find({ following: userId })
      .populate('follower', 'name avatar');
  }

  // Kiểm tra 1 người đã follow chưa
  async isFollowing(followerId: string, targetId: string) {
    const check = await this.followModel.findOne({
      follower: followerId,
      following: targetId,
    });
    return {
      isFollowed: !!check,
    };
  }
  async getSuggestions(userId: string) {
    // Lấy danh sách người mà tôi đang follow
    const following = await this.followModel
      .find({ follower: userId })
      .select('following');

    const followingIds = following.map((f) => f.following.toString());

    // Lấy tất cả user trừ chính mình và trừ danh sách đã follow
    return this.userModel
      .find({
        _id: { $nin: [...followingIds, userId] },
      })
      .select('name avatar');
  }
}
