import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Server, Socket } from 'socket.io';
import { BoardService } from './board.service';
import { UserRole } from '../common/constants/enums';

interface SocketUser {
  id: string;
  role: UserRole;
  email: string;
}

/**
 * Real-time whiteboard channel. The server is CRDT-agnostic: it authenticates
 * the socket, enforces room (lesson) access, and relays opaque Yjs/tldraw
 * updates + presence between peers in the same lesson room. Snapshots are
 * persisted via the REST endpoints (BoardController).
 */
@WebSocketGateway({ namespace: '/board', cors: { origin: '*' } })
export class BoardGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly board: BoardService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const raw =
        (client.handshake.auth?.token as string | undefined) ??
        client.handshake.headers.authorization?.replace('Bearer ', '');
      if (!raw) {
        throw new Error('no token');
      }
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        email: string;
        role: UserRole;
      }>(raw, { secret: this.config.get<string>('JWT_ACCESS_SECRET') });
      const user: SocketUser = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
      };
      client.data.user = user;
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const room = client.data.room as string | undefined;
    const user = client.data.user as SocketUser | undefined;
    if (room && user) {
      client.to(room).emit('board:peer-left', { userId: user.id });
    }
  }

  @SubscribeMessage('board:join')
  async join(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { lessonId: string },
  ): Promise<{ joined: boolean }> {
    const user = client.data.user as SocketUser | undefined;
    if (!user) {
      client.emit('board:error', { message: 'unauthorized' });
      return { joined: false };
    }
    const ok = await this.board.canAccessLesson(user.id, user.role, body.lessonId);
    if (!ok) {
      client.emit('board:error', { message: 'forbidden' });
      return { joined: false };
    }
    const room = `board:${body.lessonId}`;
    await client.join(room);
    client.data.room = room;
    client.emit('board:joined', { lessonId: body.lessonId });
    client.to(room).emit('board:peer-joined', { userId: user.id });
    return { joined: true };
  }

  @SubscribeMessage('board:update')
  update(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { lessonId: string; update: unknown },
  ): void {
    const user = client.data.user as SocketUser | undefined;
    const room = `board:${body.lessonId}`;
    client.to(room).emit('board:update', {
      userId: user?.id,
      update: body.update,
    });
  }

  @SubscribeMessage('board:cursor')
  cursor(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { lessonId: string; cursor: unknown },
  ): void {
    const user = client.data.user as SocketUser | undefined;
    const room = `board:${body.lessonId}`;
    client.to(room).emit('board:cursor', {
      userId: user?.id,
      cursor: body.cursor,
    });
  }
}
