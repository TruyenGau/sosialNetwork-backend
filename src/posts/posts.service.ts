import { BadRequestException, Injectable } from '@nestjs/common';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { InjectModel } from '@nestjs/mongoose';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import { PostDocument, Post } from './schemas/post.schemas';
import { IUser } from 'src/users/users.interface';
import mongoose from 'mongoose';
import aqp from 'api-query-params';

@Injectable()
export class PostsService {
  constructor(
    @InjectModel(Post.name) private postModel: SoftDeleteModel<PostDocument>,
  ) {}

  async create(createPostDto: CreatePostDto, user: IUser) {
    const { namePost, content, userId } = createPostDto;
    const images = createPostDto.images ?? [];
    const videos = createPostDto.videos ?? [];
    const newPost = await this.postModel.create({
      namePost,
      content,
      images,
      videos,
      userId,
      createdBy: {
        _id: user._id,
        email: user.email,
      },
    });
    return newPost;
  }

  async findAll(currentPage: number, limit: number, qs: string) {
    const { filter, sort, population, projection } = aqp(qs);
    delete filter.current;
    delete filter.pageSize;

    let offset = (+currentPage - 1) * +limit;
    let defaultLimit = +limit ? +limit : 10;

    const totalItems = (await this.postModel.find(filter)).length;
    const totalPages = Math.ceil(totalItems / defaultLimit);

    const result = await this.postModel
      .find(filter)
      .skip(offset)
      .limit(defaultLimit)
      // @ts-ignore: Unreachable code error
      .sort(sort)
      .populate(population)
      .select(projection as any)
      .exec();

    return {
      meta: {
        current: currentPage, //trang hiện tại
        pageSize: limit, //số lượng bản ghi đã lấy
        pages: totalPages, //tổng số trang với điều kiện query
        total: totalItems, // tổng số phần tử (số bản ghi)
      },
      result, //kết quả query
    };
  }

  async findOne(id: string) {
    return this.postModel.findById(id);
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

    await this.postModel.updateOne(
      { _id: id },
      {
        deletedBy: {
          _id: user._id,
          email: user.email,
        },
      },
    );
    return this.postModel.softDelete({ _id: id });
  }
}
