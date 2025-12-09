import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import {
  Public,
  ResponseMessage,
  SkipCheckPermission,
  User,
} from 'src/auth/decorator/customize';
import { IUser } from './users.interface';
import { ApiTags } from '@nestjs/swagger';
@ApiTags('user')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ResponseMessage('Create a new user')
  async create(@Body() createUserDto: CreateUserDto, @User() user: IUser) {
    let newUser = await this.usersService.create(createUserDto, user);
    return {
      _id: newUser?._id,
      createdAt: newUser?.createdAt,
    };
  }

  @ResponseMessage('Fetch user with paginate')
  @Get()
  findAll(
    @Query('current') currentPage: string,
    @Query('pageSize') limit: string,
    @Query() qs: string,
  ) {
    return this.usersService.findAll(+currentPage, +limit, qs);
  }

  @Public()
  @ResponseMessage('Fetch user by id')
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const foundUser = await this.usersService.findOne(id);
    return foundUser;
  }

  @ResponseMessage('Update a user')
  @Patch()
  async update(@Body() updateUserDto: UpdateUserDto, @User() user: IUser) {
    let updateUser = await this.usersService.update(updateUserDto, user);
    return updateUser;
  }
  @ResponseMessage('Delete a user')
  @Delete(':id')
  remove(@Param('id') id: string, @User() user: IUser) {
    return this.usersService.remove(id, user);
  }

  @SkipCheckPermission()
  @Public()
  @Get('birthday/today')
  async getTodayBirthdays() {
    return this.usersService.getTodayBirthdays();
  }

  @SkipCheckPermission()
  @Public()
  @Get('/ml/users')
  async getAllUserML() {
    return this.usersService.getAllUserML();
  }
}
