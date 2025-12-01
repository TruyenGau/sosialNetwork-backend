import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Room, RoomType } from './schemas/room.schema';
import { Message } from './schemas/message.schema';

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(Room.name) private roomModel: Model<Room>,
    @InjectModel(Message.name) private messageModel: Model<Message>,
  ) { }

  async findPrivateRoom(userA: string, userB: string) {
    return this.roomModel.findOne({
      type: RoomType.PRIVATE,
      members: { $all: [new Types.ObjectId(userA), new Types.ObjectId(userB)] },
    });
  }

  async findRoomById(roomId: string): Promise<Room | null> {
    return this.roomModel.findById(roomId)
      .populate('members', 'name email')
      .populate({
        path: 'lastMessage',
        populate: { path: 'sender', select: 'name email' },
      })
      .exec();
  }

  async createRoom(memberIds: string[], type: RoomType, name?: string) {
    if (!memberIds || memberIds.length === 0)
      throw new BadRequestException('Phải có ít nhất 1 member');

    const members = memberIds.map(id => new Types.ObjectId(id));
    const room = new this.roomModel({ members, type, name });
    return room.save();
  }

  async createOrGetPrivateRoom(userA: string, userB: string) {
    let room = await this.findPrivateRoom(userA, userB);
    if (!room) {
      room = await this.createRoom([userA, userB], RoomType.PRIVATE);
    }
    return room;
  }

  async saveMessage(
    senderId: string,
    roomId: string,
    message: { type: 'text' | 'image' | 'video'; content: string }
  ) {
    const newMessage = new this.messageModel({
      sender: senderId,
      room: roomId,
      type: message.type,
      content: message.content,
    });
    return newMessage.save();
  }

  async getMessages(roomId: string, page = 1, limit = 30) {
    const skip = (page - 1) * limit;
    return this.messageModel
      .find({ room: new Types.ObjectId(roomId) })
      .populate('sender', 'name email')
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit);
  }

  async getUserRooms(userId: string) {
    return this.roomModel
      .find({ members: new Types.ObjectId(userId) })
      .populate({
        path: 'lastMessage',
        populate: { path: 'sender', select: 'name email' },
      })
      .populate('members', 'name email')
      .sort({ updatedAt: -1 });
  }

  async addMembers(roomId: string, memberIds: string[]) {
    const room = await this.roomModel.findById(roomId);
    if (!room) throw new NotFoundException('Room not found');

    const newMembers = memberIds.map(id => new Types.ObjectId(id));
    room.members = Array.from(new Set([...room.members.map(m => m.toString()), ...memberIds]))
      .map(id => new Types.ObjectId(id));

    return room.save();
  }

  async removeMember(roomId: string, memberId: string) {
    const room = await this.roomModel.findById(roomId);
    if (!room) throw new NotFoundException('Room not found');

    room.members = room.members.filter(m => m.toString() !== memberId);
    return room.save();
  }

  async markRead(roomId: string, userId: string) {
    await this.messageModel.updateMany(
      { room: new Types.ObjectId(roomId), readBy: { $ne: new Types.ObjectId(userId) } },
      { $push: { readBy: new Types.ObjectId(userId) } },
    );
    return { ok: true };
  }

  async getUnreadCount(roomId: string, userId: string) {
    return this.messageModel.countDocuments({
      room: new Types.ObjectId(roomId),
      readBy: { $ne: new Types.ObjectId(userId) },
    });
  }
}
