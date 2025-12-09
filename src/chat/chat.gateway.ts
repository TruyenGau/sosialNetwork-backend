import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { UsersService } from 'src/users/users.service';

@WebSocketGateway({ namespace: '/chat', cors: { origin: '*' } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  private userSockets = new Map<string, Set<string>>();

  constructor(
    private chatService: ChatService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private usersService: UsersService,
  ) { }

    async handleConnection(socket: Socket) {
    try {
      const auth = socket.handshake.auth || {};
      let token = auth.token || '';
      if (!token) throw new UnauthorizedException('Token required');
      if (token.startsWith('Bearer ')) token = token.slice(7);

      const payload: any = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_ACCESS_TOKEN'),
      });

      const userId = payload._id;
      if (!userId) throw new UnauthorizedException('Invalid token');

      const set = this.userSockets.get(userId) || new Set<string>();
      set.add(socket.id);
      this.userSockets.set(userId, set);

      (socket as any).userId = userId;

      console.log(`Socket connected: ${socket.id} user:${userId}`);

      // 🔵 USER ONLINE
      await this.usersService.setOnline(userId, true);
    } catch (err) {
      console.log('Socket auth failed:', err.message);
      socket.disconnect(true);
    }
  }


    async handleDisconnect(socket: Socket) {
    const userId = (socket as any).userId;
    if (!userId) return;

    const set = this.userSockets.get(userId);
    if (set) {
      set.delete(socket.id);

      if (set.size === 0) {
        // Không còn tab / socket nào của user này nữa → OFFLINE
        this.userSockets.delete(userId);
        await this.usersService.setOnline(userId, false);
      } else {
        this.userSockets.set(userId, set);
      }
    }

    console.log(`Socket disconnected: ${socket.id} user:${userId}`);
  }


  @SubscribeMessage('send_message')
  async onSendMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { receiverId: string; content: string; type?: 'text' | 'image' | 'video' },
  ) {
    const senderId = (socket as any).userId;
    if (!senderId || !body.receiverId || !body.content) {
      return socket.emit('error', { message: 'receiverId and content required' });
    }

    const room = await this.chatService.createOrGetPrivateRoom(senderId, body.receiverId);
    const messageType = body.type || 'text';

    const savedMessage = await this.chatService.saveMessage(senderId, room._id.toString(), {
      type: messageType,
      content: body.content,
    });

    await socket.join(room._id.toString());
    this.server.to(room._id.toString()).emit('receive_message', savedMessage);


    const receiverSockets = this.userSockets.get(body.receiverId);
    if (receiverSockets) {
      receiverSockets.forEach((sid) => {
        this.server.to(sid).emit('new_message_notification', {
          roomId: room._id.toString(),
          senderId,
          message: savedMessage,
        });
      });
    }
  }

  @SubscribeMessage('join_group')
  async onJoinGroup(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { roomId: string },
  ) {
    const userId = (socket as any).userId;
    if (!userId || !body.roomId) return socket.emit('error', { message: 'roomId required' });

    const room = await this.chatService.findRoomById(body.roomId);
    if (!room) return socket.emit('error', { message: 'Room not found' });

    const isMember = room.members.some((m) => m._id.toString() === userId);
    if (!isMember) return socket.emit('error', { message: 'You are not a member' });

    await socket.join(body.roomId);
    socket.emit('joined_group', { roomId: body.roomId });


    room.members.forEach((m) => {
      if (m._id.toString() !== userId) {
        const memberSockets = this.userSockets.get(m._id.toString());
        if (memberSockets) {
          memberSockets.forEach((sid) => {
            this.server.to(sid).emit('user_joined_group', { roomId: body.roomId, userId });
          });
        }
      }
    });

    console.log(`👥 User ${userId} joined group ${body.roomId}`);
  }


  @SubscribeMessage('send_group_message')
  async onSendGroupMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { roomId: string; content: string; type?: 'text' | 'image' | 'video' },
  ) {
    const senderId = (socket as any).userId;
    if (!senderId || !body.roomId || !body.content) {
      return socket.emit('error', { message: 'roomId and content required' });
    }

    const room = await this.chatService.findRoomById(body.roomId);
    if (!room) return socket.emit('error', { message: 'Room not found' });

    const isMember = room.members.some((m) => m._id.toString() === senderId);
    if (!isMember) return socket.emit('error', { message: 'You are not a member' });

    const messageType = body.type || 'text';
    const savedMessage = await this.chatService.saveMessage(senderId, body.roomId, {
      type: messageType,
      content: body.content,
    });


    room.members.forEach((m) => {
      const memberSockets = this.userSockets.get(m._id.toString());
      if (memberSockets) {
        memberSockets.forEach((sid) => {
          this.server.to(sid).emit('receive_group_message', savedMessage);
        });
      }
    });

    room.members.forEach((m) => {
      const memberId = m._id.toString();
      if (memberId !== senderId) {
        const memberSockets = this.userSockets.get(memberId);
        if (memberSockets) {
          memberSockets.forEach((sid) => {
            this.server.to(sid).emit('new_group_message_notification', {
              roomId: body.roomId,
              senderId,
              content: body.content,
            });
          });
        }
      }
    });


    socket.emit('receive_group_message', savedMessage);

    console.log(`💬 [Group ${body.roomId}] ${senderId}: ${body.content}`);
  }
}
