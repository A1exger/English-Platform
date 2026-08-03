import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHmac, timingSafeEqual } from 'crypto';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './types/jwt-payload';
import { UserRole } from '../common/constants/enums';
import { MailService } from '../notifications/mail.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly i18n: I18nService,
    private readonly mail: MailService,
  ) {}

  async register(dto: RegisterDto): Promise<TokenPair> {
    // Public sign-up may never create admins. Admins are provisioned via the
    // seed or, in controlled environments, when ALLOW_ADMIN_REGISTRATION=true.
    if (dto.role === 'admin' && process.env.ALLOW_ADMIN_REGISTRATION !== 'true') {
      throw new ForbiddenException('Admin registration is not allowed');
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        role: dto.role,
        firstName: dto.firstName,
        lastName: dto.lastName,
        locale: dto.locale ?? 'en',
        // Provision the matching profile so the rest of the slice works.
        ...(dto.role === 'tutor'
          ? { tutorProfile: { create: {} } }
          : {}),
        ...(dto.role === 'student'
          ? { studentProfile: { create: {} } }
          : {}),
      },
    });

    return this.issueTokens(user.id, user.email, user.role as UserRole);
  }

  async login(dto: LoginDto, locale?: string): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    const invalid = async (): Promise<never> => {
      const message = await this.i18n.translate('messages.auth.invalid_credentials', {
        lang: locale ?? user?.locale ?? 'en',
      });
      throw new UnauthorizedException(message);
    };

    if (!user || !user.isActive) {
      return invalid();
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      return invalid();
    }
    return this.issueTokens(user.id, user.email, user.role as UserRole);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Find a stored, non-revoked, non-expired token for this user that matches.
    const candidates = await this.prisma.refreshToken.findMany({
      where: { userId: payload.sub, revoked: false },
    });
    let matched = null as null | { id: string };
    for (const candidate of candidates) {
      if (candidate.expiresAt < new Date()) {
        continue;
      }
      if (await bcrypt.compare(refreshToken, candidate.tokenHash)) {
        matched = { id: candidate.id };
        break;
      }
    }
    if (!matched) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Rotate: revoke the used token and issue a fresh pair.
    await this.prisma.refreshToken.update({
      where: { id: matched.id },
      data: { revoked: true },
    });

    return this.issueTokens(payload.sub, payload.email, payload.role);
  }

  private async issueTokens(
    userId: string,
    email: string,
    role: UserRole,
  ): Promise<TokenPair> {
    const payload: JwtPayload = { sub: userId, email, role };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL') ?? '15m',
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>('JWT_REFRESH_TTL') ?? '7d',
    });

    const decoded = this.jwt.decode(refreshToken) as { exp: number };
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: await bcrypt.hash(refreshToken, 10),
        expiresAt: new Date(decoded.exp * 1000),
      },
    });

    return { accessToken, refreshToken };
  }

  // --- password reset ------------------------------------------------------
  //
  // The token is stateless: the user id and an expiry, signed with the server
  // secret PLUS their current password hash. That makes it single-use for free
  // — the moment the password changes the signing key changes with it, so a
  // link cannot be replayed and no table is needed to track spent tokens.

  private resetKey(passwordHash: string): string {
    return `${this.config.get<string>('JWT_ACCESS_SECRET') ?? 'dev-secret'}:${passwordHash}`;
  }

  private signReset(userId: string, passwordHash: string, expMs: number): string {
    const body = `${userId}.${expMs}`;
    const mac = createHmac('sha256', this.resetKey(passwordHash)).update(body).digest('hex');
    return `${body}.${mac}`;
  }

  /**
   * Email a reset link. Always reports success: telling a caller that an
   * address is unknown turns this into an account-enumeration oracle.
   */
  async forgotPassword(email: string, locale?: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && user.isActive) {
      const exp = Date.now() + 60 * 60 * 1000; // one hour
      const token = this.signReset(user.id, user.passwordHash, exp);
      const base = (
        this.config.get<string>('APP_URL') ??
        this.config.get<string>('CORS_ORIGIN') ??
        'http://localhost:3000'
      )
        .split(',')[0]
        .replace(/\/$/, '');
      const lang = locale ?? user.locale ?? 'en';
      const link = `${base}/${lang}/reset-password?token=${encodeURIComponent(token)}`;
      const subject = String(
        await this.i18n.translate('messages.notification.subject', { lang }),
      );
      const text = String(
        await this.i18n.translate('messages.auth.reset_email', { lang, args: { link } }),
      );
      await this.mail.sendMail(user.email, subject, text);
    }
    return { sent: true };
  }

  /** Consume a reset link and set the new password. */
  async resetPassword(token: string, password: string) {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('Invalid or expired link');
    }
    const [userId, expRaw, mac] = parts;
    const exp = Number(expRaw);
    if (!Number.isFinite(exp) || exp < Date.now()) {
      throw new UnauthorizedException('Invalid or expired link');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid or expired link');
    }
    const expected = this.signReset(user.id, user.passwordHash, exp).split('.')[2];
    if (
      mac.length !== expected.length ||
      !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
    ) {
      throw new UnauthorizedException('Invalid or expired link');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(password, 10) },
    });
    // Sign every existing session out — a reset usually means "not only me had
    // this password".
    await this.prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    return { reset: true };
  }

}
