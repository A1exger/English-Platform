import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Ip,
  Post,
  UseGuards,
} from '@nestjs/common';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { AuthService } from './auth.service';
import { LoginThrottleService } from './login-throttle.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password-reset.dto';
import { RefreshDto } from './dto/refresh.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthenticatedUser } from './types/jwt-payload';
import { PrismaService } from '../prisma/prisma.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
    private readonly throttle: LoginThrottleService,
  ) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  /**
   * Sign in. Repeated FAILURES against one account from one client are slowed
   * down; getting it right clears the count, so a real person is never locked
   * out of their own account by using it.
   */
  @Post('login')
  async login(@Body() dto: LoginDto, @Ip() ip: string) {
    const lang = I18nContext.current()?.lang;
    if (this.throttle.isLocked(ip, dto.email)) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many sign-in attempts. Please try again later.',
          retryAfter: this.throttle.retryAfterSeconds(ip, dto.email),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    try {
      const tokens = await this.auth.login(dto, lang);
      this.throttle.recordSuccess(ip, dto.email);
      return tokens;
    } catch (e) {
      this.throttle.recordFailure(ip, dto.email);
      throw e;
    }
  }

  // Both are public: the caller has no session yet by definition.
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email, dto.locale);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.password);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    const record = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        locale: true,
        timezone: true,
        avatarUrl: true,
      },
    });
    // Demonstrate locale-aware i18n: greet the user in their own language.
    const greeting = await this.i18n.translate('messages.greeting', {
      lang: user.locale,
      args: { name: record?.firstName ?? '' },
    });
    return { ...record, greeting };
  }
}
