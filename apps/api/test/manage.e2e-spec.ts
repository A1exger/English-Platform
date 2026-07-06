import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Package delete + student create/delete (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: { accessToken: string };
  let tutor: { accessToken: string };

  const api = () => request(app.getHttpServer());
  const register = async (email: string, role: string) => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ email, password: 'Password123!', role, firstName: 'F', lastName: 'L' })
      .expect(201);
    return res.body as { accessToken: string };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.cleanDatabase();
    admin = await register('m.admin@test.com', 'admin');
    tutor = await register('m.tutor@test.com', 'tutor');
  });

  afterAll(async () => {
    await prisma.cleanDatabase();
    await app.close();
  });

  it('tutor creates then deletes a package', async () => {
    const pkg = await api()
      .post('/api/v1/billing/packages')
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .send({ name: 'P', lessonsCount: 5, priceCents: 20000, currency: 'TND' })
      .expect(201);
    await api()
      .delete(`/api/v1/billing/packages/${pkg.body.id}`)
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .expect(200);
    const list = await api()
      .get('/api/v1/billing/packages')
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .expect(200);
    expect(list.body.find((p: { id: string }) => p.id === pkg.body.id)).toBeUndefined();
  });

  it('tutor sees an admin-created (platform) package', async () => {
    const pkg = await api()
      .post('/api/v1/billing/packages')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: 'Platform', lessonsCount: 10, priceCents: 30000, currency: 'USD' })
      .expect(201);
    const list = await api()
      .get('/api/v1/billing/packages')
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .expect(200);
    expect(list.body.some((p: { id: string }) => p.id === pkg.body.id)).toBe(true);
  });

  it('admin creates a student account and deletes it', async () => {
    const created = await api()
      .post('/api/v1/crm/students/new')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ email: 'made@test.com', password: 'Password123!', firstName: 'Made', lastName: 'Bymin' })
      .expect(201);
    expect(created.body.studentProfileId).toBeDefined();

    await api()
      .delete(`/api/v1/crm/students/${created.body.studentProfileId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const gone = await prisma.user.findUnique({ where: { email: 'made@test.com' } });
    expect(gone).toBeNull();
  });

  it('tutor enrolls then unenrolls a student (account kept)', async () => {
    await register('enroll.me@test.com', 'student');
    const link = await api()
      .post('/api/v1/crm/students')
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .send({ email: 'enroll.me@test.com' })
      .expect(201);
    await api()
      .delete(`/api/v1/crm/students/${link.body.studentProfileId}`)
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .expect(200);
    // Account still exists (only unenrolled)
    const still = await prisma.user.findUnique({ where: { email: 'enroll.me@test.com' } });
    expect(still).not.toBeNull();
  });
});
