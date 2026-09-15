import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';

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

  it('admin edits a profile, and a role change provisions the new profile', async () => {
    const res = await api()
      .patch(`/api/v1/admin/users/${createdId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ firstName: 'Edited', lastName: 'Name', locale: 'ru', role: 'student' })
      .expect(200);
    expect(res.body.firstName).toBe('Edited');
    expect(res.body.locale).toBe('ru');
    expect(res.body.role).toBe('student');
    // Promoted to student -> the StudentProfile now exists (the old tutor one
    // is left alone so its history survives).
    const withProfiles = await prisma.user.findUniqueOrThrow({
      where: { id: createdId },
      include: { studentProfile: true, tutorProfile: true },
    });
    expect(withProfiles.studentProfile).not.toBeNull();
    expect(withProfiles.tutorProfile).not.toBeNull();
  });

  it('a new password set by the admin works, and deactivating blocks sign-in', async () => {
    const email = (await prisma.user.findUniqueOrThrow({ where: { id: createdId } })).email;
    await api()
      .patch(`/api/v1/admin/users/${createdId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ password: 'BrandNewPass1!' })
      .expect(200);
    await api()
      .post('/api/v1/auth/login')
      .send({ email, password: 'BrandNewPass1!' })
      .expect(201);

    await api()
      .patch(`/api/v1/admin/users/${createdId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ isActive: false })
      .expect(200);
    await api()
      .post('/api/v1/auth/login')
      .send({ email, password: 'BrandNewPass1!' })
      .expect(401);
  });

  it('admin cannot demote or deactivate themselves', async () => {
    await api()
      .patch(`/api/v1/admin/users/${adminUserId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ role: 'student' })
      .expect(400);
    await api()
      .patch(`/api/v1/admin/users/${adminUserId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ isActive: false })
      .expect(400);
  });

  it('forgot password: always accepted, and the link resets exactly once', async () => {
    const auth = app.get(AuthService);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'tutor@adm.com' } });

    // An unknown address must look identical — no account enumeration.
    await api()
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nobody@nowhere.test' })
      .expect(201)
      .expect((r) => expect(r.body.sent).toBe(true));
    await api().post('/api/v1/auth/forgot-password').send({ email: user.email }).expect(201);

    // Mint the same token the email carries.
    const token = (
      auth as unknown as {
        signReset(id: string, hash: string, exp: number): string;
      }
    ).signReset(user.id, user.passwordHash, Date.now() + 60_000);

    await api()
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'ResetPass123!' })
      .expect(201);
    await api()
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'ResetPass123!' })
      .expect(201);

    // Replaying the same link fails: the signing key includes the old hash.
    await api()
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'Another123!' })
      .expect(401);
    // So does a forged one.
    await api()
      .post('/api/v1/auth/reset-password')
      .send({ token: `${user.id}.${Date.now() + 60_000}.deadbeef`, password: 'Another123!' })
      .expect(401);
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
