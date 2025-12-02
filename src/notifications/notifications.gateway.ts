import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: true,
})
export class NotificationGateway {
  @WebSocketServer()
  server: Server;

  private users = new Map<string, string>(); // userId → socketId

  handleConnection(socket: Socket) {
    const userId = socket.handshake.query.userId as string;
    if (userId) {
      this.users.set(userId, socket.id);
      console.log('User connected:', userId);
    }
  }

  handleDisconnect(socket: Socket) {
    for (const [uid, sid] of this.users.entries()) {
      if (sid === socket.id) this.users.delete(uid);
    }
  }

  sendNotification(userId: string, payload: any) {
    const socketId = this.users.get(userId);
    if (socketId) {
      this.server.to(socketId).emit('notification', payload);
    }
  }
}
