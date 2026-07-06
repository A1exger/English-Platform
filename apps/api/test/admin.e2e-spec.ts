import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Admin user management (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let admin: { accessToken: string };
  let tutor: { accessToken: string };
  let adminUserId: string;
  let createdId: string;

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
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.cleanDatabase();

    admin = await register('admin@adm.com', 'admin');
    tutor = await register('tutor@adm.com', 'tutor');
    adminUserId = (await prisma.user.findUnique({ where: { email: 'admin@adm.com' } }))!.id;
  });

  afterAll(async () => {
    await prisma.cleanDatabase();
    await app.close();
  });

  it('non-admin cannot list users', async () => {
    await api()
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${tutor.accessToken}`)
      .expect(403);
  });

  it('admin lists users', async () => {
    const res = await api()
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });

  it('admin creates a tutor (with profile)', async () => {
    const res = await api()
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        email: 'new.tutor@adm.com',
        password: 'Password123!',
        role: 'tutor',
        firstName: 'New',
        lastName: 'Tutor',
      })
      .expect(201);
    expect(res.body.role).toBe('tutor');
    createdId = res.body.id;
    const profile = await prisma.tutorProfile.findUnique({ where: { userId: createdId } });
    expect(profile).not.toBeNull();
  });

  it('admin can create another admin (bypasses public restriction)', async () => {
    const res = await api()
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        email: 'second.admin@adm.com',
        password: 'Password123!',
        role: 'admin',
        firstName: 'Second',
        lastName: 'Admin',
      })
      .expect(201);
    expect(res.body.role).toBe('admin');
  });

  it('rejects duplicate email', async () => {
    await api()
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        email: 'new.tutor@adm.com',
        password: 'Password123!',
        role: 'student',
        firstName: 'X',
        lastName: 'Y',
      })
      .expect(409);
  });

  it('admin cannot delete their own account', async () => {
    await api()
      .delete(`/api/v1/admin/users/${adminUserId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(400);
  });

  it('admin deletes a user', async () => {
    await api()
      .delete(`/api/v1/admin/users/${createdId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const gone = await prisma.user.findUnique({ where: { id: createdId } });
    expect(gone).toBeNull();
  });
});
