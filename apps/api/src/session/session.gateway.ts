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
import { BoardService } from '../board/board.service';
import { UserRole } from '../common/constants/enums';
import {
  Envelope,
  envelopeRoleFor,
  isAuthorized,
  sealEnvelope,
} from './envelope';

interface SocketUser {
  id: string;
  role: UserRole;
  email: string;
}

/**
 * Live-session channel, layered OVER the board gateway (the /board namespace and
 * its draw:* events are untouched). Everything here is an Envelope:
 *   - nav:goto / session:loadMaterial  teacher -> room (teacher owns navigation)
 *   - exercise:progress                student -> room (teacher's read-model)
 * The server re-stamps every envelope (sealEnvelope) so senderRole/session can't
 * be spoofed, and keeps a small in-memory state so late joiners sync instantly.
 */
@WebSocketGateway({ namespace: '/session', cors: { origin: '*' } })
export class SessionGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;

  // sessionId -> last material/page, for late-join synchronization.
  private readonly sessionState = new Map<
    string,
    { lessonId?: string; pageId?: string }
  >();

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
      if (!raw) throw new Error('no token');
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        email: string;
        role: UserRole;
      }>(raw, { secret: this.config.get<string>('JWT_ACCESS_SECRET') });
      client.data.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
      } as SocketUser;
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const room = client.data.sessionRoom as string | undefined;
    const user = client.data.user as SocketUser | undefined;
    if (room && user) {
      client.to(room).emit('session:peer-left', { userId: user.id });
    }
  }

  @SubscribeMessage('session:join')
  async join(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { sessionId: string },
  ): Promise<{ joined: boolean }> {
    const user = client.data.user as SocketUser | undefined;
    if (!user) {
      client.emit('session:error', { message: 'unauthorized' });
      return { joined: false };
    }
    // sessionId is the lessonId: reuse the board's access check verbatim.
    const ok = await this.board.canAccessLesson(user.id, user.role, body.sessionId);
    if (!ok) {
      client.emit('session:error', { message: 'forbidden' });
      return { joined: false };
    }
    const room = `session:${body.sessionId}`;
    await client.join(room);
    client.data.sessionRoom = room;
    client.data.sessionId = body.sessionId;
    client.emit('session:joined', {
      sessionId: body.sessionId,
      // Current material/page so a late joiner lands on the right screen.
      state: this.sessionState.get(body.sessionId) ?? {},
    });
    client.to(room).emit('session:peer-joined', { userId: user.id });
    return { joined: true };
  }

  @SubscribeMessage('session:emit')
  emit(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: Partial<Envelope>,
  ): void {
    const user = client.data.user as SocketUser | undefined;
    const room = client.data.sessionRoom as string | undefined;
    const sessionId = client.data.sessionId as string | undefined;
    if (!user || !room || !sessionId) return;

    const role = envelopeRoleFor(user.role);
    if (!role) return;
    if (!isAuthorized(String(body.type), role)) return;

    const env = sealEnvelope(body, sessionId, role);
    this.trackState(sessionId, env);
    // Relay to everyone else in the room (students apply, teacher observes).
    client.to(room).emit('session:event', env);
  }

  /** Remember teacher-driven material/page so late joiners can be synced. */
  private trackState(sessionId: string, env: Envelope): void {
    if (env.type === 'session:loadMaterial') {
      const p = env.payload as { lessonId?: string };
      this.sessionState.set(sessionId, { lessonId: p?.lessonId, pageId: undefined });
    } else if (env.type === 'nav:goto') {
      const prev = this.sessionState.get(sessionId) ?? {};
      const p = env.payload as { pageId?: string };
      this.sessionState.set(sessionId, { ...prev, pageId: p?.pageId });
    }
  }
}
