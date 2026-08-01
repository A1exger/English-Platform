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

  it('an event fans out to in-app, email and the linked Telegram chat', async () => {
    await notifications.enqueue({
      userId: studentUserId,
      templateKey: 'homework_feedback',
      payload: { title: 'Present Simple: my day' },
    });

    const rows = await prisma.notification.findMany({
      where: { userId: studentUserId, templateKey: 'homework_feedback' },
    });
    // The chat was linked in the first test, so all three routes are queued.
    expect(rows.map((r) => r.channel).sort()).toEqual(['email', 'in_app', 'telegram']);

    const res = await api()
      .post('/api/v1/notifications/dispatch')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(201);
    const sent = (res.body as { channel: string; text: string; delivered: string }[]).filter((n) =>
      n.text.includes('Present Simple: my day'),
    );
    expect(sent).toHaveLength(3);
    // Without SMTP configured the email route is skipped, not failed.
    expect(sent.find((n) => n.channel === 'email')!.delivered).toBe('skipped');
    // The bell only reads in-app rows, so exactly one shows up there.
    const inApp = await api()
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(200);
    expect(
      (inApp.body as { channel: string; templateKey: string }[]).filter(
        (n) => n.templateKey === 'homework_feedback' && n.channel === 'in_app',
      ),
    ).toHaveLength(1);
  });
});
