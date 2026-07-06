import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { io, Socket } from 'socket.io-client';
import { AddressInfo } from 'net';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Interactive board (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let port: number;

  let tutor: { accessToken: string };
  let tutor2: { accessToken: string };
  let student: { accessToken: string };
  let lessonId: string;

  const api = () => request(app.getHttpServer());

  const register = async (email: string, role: string) => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ email, password: 'Password123!', role, firstName: 'F', lastName: 'L' })
      .expect(201);
    return res.body as { accessToken: string };
  };

  const connect = (token: string): Promise<Socket> =>
    new Promise((resolve, reject) => {
      const socket = io(`http://localhost:${port}/board`, {
        auth: { token },
        transports: ['websocket'],
        forceNew: true,
      });
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', reject);
      setTimeout(() => reject(new Error('connect timeout')), 4000);
    });

  const once = <T>(socket: Socket, event: string): Promise<T> =>
    new Promise((resolve, reject) => {
      socket.once(event, resolve);
      setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), 4000);
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    await app.listen(0); // real port for socket.io clients
    port = (app.getHttpServer().address() as AddressInfo).port;

    prisma = app.get(PrismaService);
    await prisma.cleanDatabase();

    tutor = await register('btutor@board.com', 'tutor');
    tutor2 = await register('btutor2@board.com', 'tutor');
    student = await register('bstudent@board.com', 'student');

    const lesson = await api()
      .post('/api/v1/lessons')
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .send({
        title: 'Board lesson',
        startsAt: new Date(Date.now() + 3600000).toISOString(),
        endsAt: new Date(Date.now() + 7200000).toISOString(),
      })
      .expect(201);
    lessonId = lesson.body.id;

    await api()
      .post(`/api/v1/lessons/${lessonId}/book`)
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(201);
  });

  afterAll(async () => {
    await prisma.cleanDatabase();
    await app.close();
  });

  // --- REST persistence -----------------------------------------------------

  it('lazily creates a board for the lesson', async () => {
    const res = await api()
      .get(`/api/v1/lessons/${lessonId}/board`)
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .expect(200);
    expect(res.body.lessonId).toBe(lessonId);
    expect(res.body.latestSnapshot).toBeNull();
  });

  it('saves a snapshot and exposes history', async () => {
    await api()
      .post(`/api/v1/lessons/${lessonId}/board/snapshot`)
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .send({ snapshot: '{"shapes":[{"id":"1","type":"draw"}]}', label: 'after lesson' })
      .expect(201);

    const board = await api()
      .get(`/api/v1/lessons/${lessonId}/board`)
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(200);
    expect(board.body.latestSnapshot).toContain('draw');

    const history = await api()
      .get(`/api/v1/lessons/${lessonId}/board/history`)
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .expect(200);
    expect(history.body.length).toBe(1);
    expect(history.body[0].label).toBe('after lesson');
  });

  it('denies board access to a non-participant', async () => {
    await api()
      .get(`/api/v1/lessons/${lessonId}/board`)
      .set('Authorization', `Bearer ${tutor2.accessToken}`)
      .expect(403);
  });

  // --- Real-time relay ------------------------------------------------------

  it('relays live updates between participants in the room', async () => {
    const tutorSock = await connect(tutor.accessToken);
    const studentSock = await connect(student.accessToken);

    try {
      await Promise.all([
        (async () => {
          tutorSock.emit('board:join', { lessonId });
          await once(tutorSock, 'board:joined');
        })(),
        (async () => {
          studentSock.emit('board:join', { lessonId });
          await once(studentSock, 'board:joined');
        })(),
      ]);

      const received = once<{ userId: string; update: unknown }>(
        studentSock,
        'board:update',
      );
      tutorSock.emit('board:update', { lessonId, update: { op: 'draw', x: 10 } });

      const msg = await received;
      expect(msg.update).toEqual({ op: 'draw', x: 10 });
    } finally {
      tutorSock.close();
      studentSock.close();
    }
  });

  it('rejects an unauthenticated socket (server disconnects it)', async () => {
    const socket = io(`http://localhost:${port}/board`, {
      auth: { token: 'garbage-token' },
      transports: ['websocket'],
      forceNew: true,
    });
    const kicked = await new Promise<boolean>((resolve) => {
      socket.on('disconnect', () => resolve(true));
      socket.on('connect_error', () => resolve(true));
      setTimeout(() => resolve(false), 4000);
    });
    socket.close();
    expect(kicked).toBe(true);
  });
});
