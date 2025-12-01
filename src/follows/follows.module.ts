import { Module } from '@nestjs/common';
import { FollowService } from './follows.service';
import { FollowController } from './follows.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from 'src/users/schemas/user.schema';
import { Follow, FollowSchema } from './schemas/follow.schemas';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Follow.name, schema: FollowSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [FollowController],
  providers: [FollowService],
})
export class FollowsModule {}
