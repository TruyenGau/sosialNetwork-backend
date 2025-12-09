import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Res,
  Query,
} from '@nestjs/common';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import {
  Public,
  ResponseMessage,
  SkipCheckPermission,
  User,
} from 'src/auth/decorator/customize';
import { IUser } from 'src/users/users.interface';

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @ResponseMessage('Create a new post')
  @Post()
  create(@Body() createPostDto: CreatePostDto, @User() user: IUser) {
    return this.postsService.create(createPostDto, user);
  }

  @ResponseMessage('Fetch list post with paginate')
  @Get()
  findAll(
    @Query('current') currentPage: string,
    @Query('pageSize') limit: string,
    @Query() qs: string,
    @User() user: IUser,
  ) {
    return this.postsService.findAll(+currentPage, +limit, qs, user);
  }

  @SkipCheckPermission()
  @ResponseMessage('Fetch list post with group ')
  @Get('group/:groupId')
  findAllWithGroup(
    @Query('current') currentPage: string,
    @Query('pageSize') limit: string,
    @Query() qs: string,
    @User() user: IUser,
    @Param('groupId') groupId: string,
  ) {
    return this.postsService.findAllWithGroup(
      +currentPage,
      +limit,
      qs,
      user,
      groupId,
    );
  }

  @SkipCheckPermission()
  @ResponseMessage('Fetch list post paginate with userId')
  @Get('/user/:id')
  findAllById(
    @Param('id') userId: string,
    @Query('current') currentPage: string,
    @Query('pageSize') limit: string,
    @Query() qs: string,
    @User() user: IUser,
  ) {
    return this.postsService.findAllById(+currentPage, +limit, qs, userId);
  }

  @ResponseMessage('Fetch a post by id')
  @Get(':id')
  findOne(@Param('id') id: string, @User() user: IUser) {
    return this.postsService.findOne(id, user);
  }

  @ResponseMessage('Update a post by id')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updatePostDto: UpdatePostDto,
    @User() user: IUser,
  ) {
    return this.postsService.update(id, updatePostDto, user);
  }

  @ResponseMessage('Delete a post by id')
  @Delete(':id')
  remove(@Param('id') id: string, @User() user: IUser) {
    return this.postsService.remove(id, user);
  }
}
