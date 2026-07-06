import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock; create: jest.Mock };
    refreshToken: {
      create: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
  };
  let jwt: { signAsync: jest.Mock; verifyAsync: jest.Mock; decode: jest.Mock };

  const i18n = {
    translate: jest.fn().mockResolvedValue('Invalid email or password.'),
  };

  const config = {
    get: jest.fn((key: string) => {
      const map: Record<string, string> = {
        JWT_ACCESS_SECRET: 'access-secret',
        JWT_REFRESH_SECRET: 'refresh-secret',
        JWT_ACCESS_TTL: '15m',
        JWT_REFRESH_TTL: '7d',
      };
      return map[key];
    }),
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), create: jest.fn() },
      refreshToken: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    jwt = {
      signAsync: jest
        .fn()
        .mockImplementation((_p, opts) =>
          Promise.resolve(`token-${opts.secret}`),
        ),
      verifyAsync: jest.fn(),
      decode: jest.fn().mockReturnValue({
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
        { provide: (require('nestjs-i18n').I18nService), useValue: i18n },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('register', () => {
    it('hashes password, creates user, returns tokens', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        role: 'student',
      });

      const result = await service.register({
        email: 'a@b.com',
        password: 'Password123!',
        role: 'student',
        firstName: 'A',
        lastName: 'B',
      });

      expect(prisma.user.create).toHaveBeenCalled();
      const createArg = prisma.user.create.mock.calls[0][0];
      expect(createArg.data.passwordHash).not.toEqual('Password123!');
      expect(
        await bcrypt.compare('Password123!', createArg.data.passwordHash),
      ).toBe(true);
      // student role provisions a studentProfile
      expect(createArg.data.studentProfile).toBeDefined();
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(prisma.refreshToken.create).toHaveBeenCalled();
    });

    it('throws ConflictException when email already exists', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(
        service.register({
          email: 'a@b.com',
          password: 'Password123!',
          role: 'student',
          firstName: 'A',
          lastName: 'B',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    it('returns tokens for valid credentials', async () => {
      const passwordHash = await bcrypt.hash('Password123!', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        role: 'tutor',
        passwordHash,
        isActive: true,
        locale: 'en',
      });

      const result = await service.login({
        email: 'a@b.com',
        password: 'Password123!',
      });
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });

    it('throws UnauthorizedException for wrong password', async () => {
      const passwordHash = await bcrypt.hash('Password123!', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        role: 'tutor',
        passwordHash,
        isActive: true,
        locale: 'en',
      });
      await expect(
        service.login({ email: 'a@b.com', password: 'wrong' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws UnauthorizedException for unknown user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login({ email: 'nope@b.com', password: 'whatever' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('rotates a valid stored refresh token', async () => {
      jwt.verifyAsync.mockResolvedValue({
        sub: 'u1',
        email: 'a@b.com',
        role: 'student',
      });
      // The provided token below must match the stored hash.
      const incoming = 'the-refresh-token';
      const storedHash = await bcrypt.hash(incoming, 10);
      prisma.refreshToken.findMany.mockResolvedValue([
        {
          id: 'rt1',
          tokenHash: storedHash,
          expiresAt: new Date(Date.now() + 3600_000),
          revoked: false,
        },
      ]);

      const result = await service.refresh(incoming);
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt1' },
        data: { revoked: true },
      });
      expect(result.accessToken).toBeDefined();
    });

    it('rejects an invalid refresh token', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('bad'));
      await expect(service.refresh('garbage')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});
