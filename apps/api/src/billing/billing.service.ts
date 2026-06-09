import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types/jwt-payload';
import { CreatePackageDto } from './dto/create-package.dto';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { CheckoutProvider } from '../common/constants/enums';
import { PaymentProviderRegistry } from './providers/payment-provider.registry';

interface LessonForCharge {
  id: string;
  priceCents: number;
  currency: string;
  participants: { studentProfile: { id: string; userId: string; balanceCents: number } }[];
}

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: PaymentProviderRegistry,
  ) {}

  // --- profiles -------------------------------------------------------------

  private async tutorProfileForUser(userId: string) {
    const profile = await this.prisma.tutorProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new ForbiddenException('No tutor profile for this user');
    }
    return profile;
  }

  private async studentProfileForUser(userId: string) {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new ForbiddenException('No student profile for this user');
    }
    return profile;
  }

  // --- packages (tariffs) ---------------------------------------------------

  async listPackages(user: AuthenticatedUser) {
    if (user.role === 'tutor') {
      const tutor = await this.prisma.tutorProfile.findUnique({
        where: { userId: user.id },
      });
      return tutor
        ? this.prisma.package.findMany({ where: { tutorProfileId: tutor.id } })
        : [];
    }
    if (user.role === 'admin') {
      return this.prisma.package.findMany();
    }
    // students/parents only see purchasable (active) packages
    return this.prisma.package.findMany({ where: { isActive: true } });
  }

  async createPackage(user: AuthenticatedUser, dto: CreatePackageDto) {
    const tutor = await this.tutorProfileForUser(user.id);
    return this.prisma.package.create({
      data: {
        tutorProfileId: tutor.id,
        name: dto.name,
        lessonsCount: dto.lessonsCount,
        priceCents: dto.priceCents,
        currency: dto.currency ?? tutor.currency,
        validityDays: dto.validityDays,
      },
    });
  }

  // --- balance / history ----------------------------------------------------

  async getBalance(user: AuthenticatedUser) {
    const student = await this.studentProfileForUser(user.id);
    const [packages, ledger] = await Promise.all([
      this.prisma.studentPackage.findMany({
        where: { studentProfileId: student.id, lessonsRemaining: { gt: 0 } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.ledgerEntry.findMany({
        where: { studentProfileId: student.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    return {
      balanceCents: student.balanceCents,
      lessonsRemaining: packages.reduce((n, p) => n + p.lessonsRemaining, 0),
      packages,
      ledger,
    };
  }

  listTransactions(user: AuthenticatedUser) {
    return this.prisma.transaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  listInvoices(user: AuthenticatedUser) {
    return this.prisma.invoice.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  // --- checkout -------------------------------------------------------------

  async createCheckout(user: AuthenticatedUser, dto: CreateCheckoutDto) {
    const student = await this.studentProfileForUser(user.id);

    let amountCents: number;
    let currency: string;
    const metadata: Record<string, string> = {};

    if (dto.packageId) {
      const pkg = await this.prisma.package.findUnique({
        where: { id: dto.packageId },
      });
      if (!pkg || !pkg.isActive) {
        throw new BadRequestException('Package not found or inactive');
      }
      amountCents = pkg.priceCents;
      currency = pkg.currency;
      metadata.packageId = pkg.id;
    } else if (dto.amountCents) {
      amountCents = dto.amountCents;
      currency = 'EUR';
    } else {
      throw new BadRequestException('Provide either packageId or amountCents');
    }

    const transaction = await this.prisma.transaction.create({
      data: {
        userId: user.id,
        type: 'topup',
        provider: dto.provider,
        amountCents,
        currency,
        status: 'pending',
        metadata: JSON.stringify(metadata),
      },
    });

    const provider = this.providers.get(dto.provider);
    const session = await provider.createCheckout({
      transactionId: transaction.id,
      amountCents,
      currency,
      description: dto.packageId ? 'Lesson package' : 'Balance top-up',
    });

    await this.prisma.transaction.update({
      where: { id: transaction.id },
      data: { externalId: session.externalId },
    });

    void student; // student existence validated above
    return {
      transactionId: transaction.id,
      provider: dto.provider,
      amountCents,
      currency,
      externalId: session.externalId,
      checkoutUrl: session.checkoutUrl,
    };
  }

  // --- webhooks -------------------------------------------------------------

  async handleWebhook(
    providerName: CheckoutProvider,
    rawBody: string,
    signature: string,
  ) {
    const provider = this.providers.get(providerName);
    const event = provider.parseWebhook(rawBody, signature);

    const tx = await this.prisma.transaction.findUnique({
      where: { externalId: event.externalId },
    });
    if (!tx) {
      // Unknown transaction: ack so the provider stops retrying.
      return { received: true, status: 'ignored' as const };
    }
    if (tx.status === 'succeeded' || tx.status === 'failed') {
      return { received: true, status: 'already_processed' as const };
    }

    if (event.status === 'failed') {
      await this.prisma.transaction.update({
        where: { id: tx.id },
        data: { status: 'failed' },
      });
      return { received: true, status: 'failed' as const };
    }

    const user = await this.prisma.user.findUnique({ where: { id: tx.userId } });
    const student = await this.prisma.studentProfile.findUnique({
      where: { userId: tx.userId },
    });
    if (!student) {
      throw new BadRequestException('Payer has no student profile');
    }
    const metadata: { packageId?: string } = tx.metadata
      ? JSON.parse(tx.metadata)
      : {};

    await this.prisma.$transaction(async (db) => {
      await db.transaction.update({
        where: { id: tx.id },
        data: { status: 'succeeded' },
      });

      if (metadata.packageId) {
        // Package purchase grants lessons; it does not add cash balance.
        const pkg = await db.package.findUnique({
          where: { id: metadata.packageId },
        });
        if (pkg) {
          await db.studentPackage.create({
            data: {
              studentProfileId: student.id,
              packageId: pkg.id,
              lessonsTotal: pkg.lessonsCount,
              lessonsRemaining: pkg.lessonsCount,
              expiresAt: pkg.validityDays
                ? new Date(Date.now() + pkg.validityDays * 86400000)
                : null,
              transactionId: tx.id,
            },
          });
        }
      } else {
        // Top-up credits the cash balance via a ledger entry.
        const balanceAfter = student.balanceCents + tx.amountCents;
        await db.studentProfile.update({
          where: { id: student.id },
          data: { balanceCents: balanceAfter },
        });
        await db.ledgerEntry.create({
          data: {
            studentProfileId: student.id,
            amountCents: tx.amountCents,
            currency: tx.currency,
            reason: 'topup',
            referenceType: 'transaction',
            referenceId: tx.id,
            balanceAfterCents: balanceAfter,
          },
        });
      }

      await db.invoice.create({
        data: {
          userId: tx.userId,
          number: `INV-${new Date().getFullYear()}-${tx.id.slice(-8).toUpperCase()}`,
          amountCents: tx.amountCents,
          currency: tx.currency,
          status: 'paid',
          locale: user?.locale ?? 'en',
          transactionId: tx.id,
        },
      });
    });

    return { received: true, status: 'succeeded' as const };
  }

  // --- auto-charge on lesson completion ------------------------------------

  /**
   * Charge each participant for a completed lesson. Prefers consuming a package
   * lesson; otherwise debits the cash balance. Idempotent per (lesson, student)
   * via a deterministic Transaction.externalId.
   */
  async chargeForCompletedLesson(lesson: LessonForCharge): Promise<void> {
    for (const { studentProfile } of lesson.participants) {
      const chargeKey = `lesson:${lesson.id}:${studentProfile.id}`;
      const existing = await this.prisma.transaction.findUnique({
        where: { externalId: chargeKey },
      });
      if (existing) {
        continue; // already charged for this lesson
      }

      await this.prisma.$transaction(async (db) => {
        const pkg = await db.studentPackage.findFirst({
          where: {
            studentProfileId: studentProfile.id,
            lessonsRemaining: { gt: 0 },
          },
          orderBy: { createdAt: 'asc' },
        });

        if (pkg) {
          await db.studentPackage.update({
            where: { id: pkg.id },
            data: { lessonsRemaining: { decrement: 1 } },
          });
          await db.transaction.create({
            data: {
              userId: studentProfile.userId,
              type: 'charge',
              provider: 'manual',
              amountCents: 0,
              currency: lesson.currency,
              status: 'succeeded',
              externalId: chargeKey,
              metadata: JSON.stringify({
                lessonId: lesson.id,
                via: 'package',
                packageId: pkg.packageId,
              }),
            },
          });
        } else {
          const balanceAfter = studentProfile.balanceCents - lesson.priceCents;
          await db.studentProfile.update({
            where: { id: studentProfile.id },
            data: { balanceCents: balanceAfter },
          });
          await db.ledgerEntry.create({
            data: {
              studentProfileId: studentProfile.id,
              amountCents: -lesson.priceCents,
              currency: lesson.currency,
              reason: 'charge',
              referenceType: 'lesson',
              referenceId: lesson.id,
              balanceAfterCents: balanceAfter,
            },
          });
          await db.transaction.create({
            data: {
              userId: studentProfile.userId,
              type: 'charge',
              provider: 'manual',
              amountCents: lesson.priceCents,
              currency: lesson.currency,
              status: 'succeeded',
              externalId: chargeKey,
              metadata: JSON.stringify({ lessonId: lesson.id, via: 'balance' }),
            },
          });
        }
      });
    }
  }
}
