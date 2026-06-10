import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationsService } from '../src/notifications/notifications.service';

describe('Telegram notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let notifications: NotificationsService;

  let student: { accessToken: string };
  let admin: { accessToken: string };
  let studentUserId: string;

  const api = () => request(app.getHttpServer());

  const register = async (email: string, role: string, locale = 'en') => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ email, password: 'Password123!', role, firstName: 'F', lastName: 'L', locale })
      .expect(201);
    return res.body as { accessToken: string };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    notifications = app.get(NotificationsService);
    await prisma.cleanDatabase();

    student = await register('tg.student@test.com', 'student', 'de');
    admin = await register('tg.admin@test.com', 'admin');
    const u = await prisma.user.findUnique({ where: { email: 'tg.student@test.com' } });
    studentUserId = u!.id;
  });

  afterAll(async () => {
    await prisma.cleanDatabase();
    await app.close();
  });

  it('links the user Telegram chat', async () => {
    const res = await api()
      .post('/api/v1/notifications/telegram/link')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ chatId: '555111' })
      .expect(201);
    expect(res.body.chatId).toBe('555111');
  });

  it('dispatch routes a telegram notification (skipped without bot token) and renders in locale', async () => {
    await notifications.enqueue({
      userId: studentUserId,
      templateKey: 'lesson_reminder',
      channel: 'telegram',
      payload: { title: 'Grammar', time: '10:00' },
    });

    const res = await api()
      .post('/api/v1/notifications/dispatch')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(201);

    const tg = (res.body as { channel: string; delivered: string; text: string; locale: string }[]).find(
      (n) => n.channel === 'telegram',
    );
    expect(tg).toBeDefined();
    expect(tg!.locale).toBe('de');
    expect(tg!.text).toContain('Grammar'); // rendered German template with args
    // No TELEGRAM_BOT_TOKEN in tests -> delivery is cleanly skipped.
    expect(tg!.delivered).toBe('skipped');
  });
});
