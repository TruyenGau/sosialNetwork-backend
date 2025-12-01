// src/communities/communities.controller.ts
import {
    Controller,
    Post,
    Body,
    Get,
    Query,
    Param,
    Patch,
    Delete,
} from '@nestjs/common';
import { CommunitiesService } from './communities.service';
import { CreateCommunityDto } from './dto/create-community.dto';
import { UpdateCommunityDto } from './dto/update-community.dto';
import { ResponseMessage, SkipCheckPermission, User } from 'src/auth/decorator/customize';
import { IUser } from 'src/users/users.interface';
import { ApiTags } from '@nestjs/swagger';


@ApiTags('community')
@Controller('communities')
export class CommunitiesController {
    constructor(private readonly communitiesService: CommunitiesService) { }

    @ResponseMessage('Create a new community')
    @SkipCheckPermission()
    @Post()
    create(@Body() dto: CreateCommunityDto, @User() user: IUser) {
        return this.communitiesService.create(dto, user);
    }

    @ResponseMessage('Fetch communities with paginate')
    @SkipCheckPermission()
    @Get()
    findAll(
        @Query('current') currentPage: string,
        @Query('pageSize') limit: string,
        @Query() qs: string,
    ) {
        return this.communitiesService.findAll(+currentPage, +limit, qs);
    }

    @ResponseMessage('Get community by id')
    @SkipCheckPermission()
    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.communitiesService.findOne(id);
    }

    @ResponseMessage('Update a community')
    @SkipCheckPermission()
    @Patch(':id')
    update(
        @Param('id') id: string,
        @Body() dto: UpdateCommunityDto,
        @User() user: IUser
    ) {
        return this.communitiesService.update(id, dto, user);
    }

    @ResponseMessage('Delete a community')
    @SkipCheckPermission()
    @Delete(':id')
    remove(@Param('id') id: string, @User() user: IUser) {
        return this.communitiesService.remove(id, user);
    }

    @ResponseMessage('Join community')
    @SkipCheckPermission()
    @Post(':id/join')
    join(@Param('id') id: string, @User() user: IUser) {
        return this.communitiesService.join(id, user);
    }

    @ResponseMessage('Leave community')
    @SkipCheckPermission()
    @Post(':id/leave')
    leave(@Param('id') id: string, @User() user: IUser) {
        return this.communitiesService.leave(id, user);
    }

    @ResponseMessage('Add member (admin)')
    @SkipCheckPermission()
    @Post(':id/add-member/:memberId')
    addMember(@Param('id') id: string, @Param('memberId') memberId: string, @User() user: IUser) {
        return this.communitiesService.addMember(id, memberId, user);
    }

    @ResponseMessage('Remove member (admin)')
    @SkipCheckPermission()
    @Post(':id/remove-member/:memberId')
    removeMember(@Param('id') id: string, @Param('memberId') memberId: string, @User() user: IUser) {
        return this.communitiesService.removeMember(id, memberId, user);
    }

    @ResponseMessage('Get members (paginated)')
    @Get(':id/members')
    getMembers(@Param('id') id: string, @Query('current') current: string, @Query('pageSize') pageSize: string) {
        return this.communitiesService.getMembers(id, +current, +pageSize);
    }

    @ResponseMessage('Remove post (admin or owner)')
    @SkipCheckPermission()
    @Delete(':id/posts/:postId')
    removePost(
        @Param('id') id: string,
        @Param('postId') postId: string,
        @User() user: IUser,
    ) {
        return this.communitiesService.removePost(id, postId, user);
    }
}
