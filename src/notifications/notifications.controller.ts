import { Controller, Get, Patch, Param, UseGuards } from '@nestjs/common';

import { NotificationsService } from './notifications.service';
import { SkipCheckPermission, User } from 'src/auth/decorator/customize';
import { IUser } from 'src/users/users.interface';

@Controller('api/v1/notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  @SkipCheckPermission()
  async getAll(@User() user: IUser) {
    return this.notificationsService.getUserNotifications(user._id);
  }
  @SkipCheckPermission()
  @Patch(':id/read')
  async markRead(@Param('id') id: string) {
    return this.notificationsService.markAsRead(id);
  }
}
