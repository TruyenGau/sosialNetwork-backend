import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument } from 'mongoose';
import { Role } from 'src/roles/schema/role.schema';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true })
  email: string;

  @Prop()
  name: string;

  @Prop()
  password: string;

  @Prop()
  age: number;

  @Prop()
  phoneNumber: string;

  @Prop()
  gender: string; // sex

  @Prop()
  address: string;

  @Prop()
  avatar: string;

  @Prop()
  type: string;

  @Prop()
  community: string[];

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: Role.name })
  role: mongoose.Schema.Types.ObjectId;

  @Prop()
  refreshToken: string;

  @Prop({ default: false, index: true })
  online: boolean;

  @Prop({ type: Date, default: null })
  lastActive: Date;

  @Prop({ type: Object })
  createdBy: {
    _id: mongoose.Schema.Types.ObjectId;
    email: string;
  };

  @Prop({ type: Object })
  updatedBy: {
    _id: mongoose.Schema.Types.ObjectId;
    email: string;
  };

  @Prop({ type: Object })
  deletedBy: {
    _id: mongoose.Schema.Types.ObjectId;
    email: string;
  };
  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;

  @Prop()
  isDeleted: boolean;

  @Prop()
  deletedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
