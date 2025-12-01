import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { NotificationsService } from './notifications.service';
import { NotificationGateway } from './notifications.gateway';
import {
  NotificationSchema,
  Notification,
} from './schemas/notification.schemas';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
    ]),
  ],
  providers: [NotificationsService, NotificationGateway],
  exports: [NotificationsService],
})
export class NotificationsModule {}
