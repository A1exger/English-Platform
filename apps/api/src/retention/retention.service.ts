import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 86_400_000;
/** Six months. Long enough to revisit last term's board, short enough to forget. */
const DEFAULT_DAYS = 180;
/** How often the sweep runs. Daily is plenty for a six-month cutoff. */
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Deletes what the platform no longer needs to keep.
 *
 * Right now that is the whiteboards and their version history. A board holds
 * whatever was written during a lesson — a student's sentences, their mistakes,
 * the shared notepad — and none of it has any use six months on, while all of
 * it is personal data that would have to be produced on an access request and
 * explained in a retention policy. Keeping it is the expensive option.
 *
 * The cutoff is the LESSON's end, not the row's age: a board is a record of
 * when the lesson happened. Only when the lesson is gone does the board's own
 * last write date it instead.
 */
@Injectable()
export class RetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RetentionService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Days to keep a board after its lesson. `RETENTION_DAYS` overrides. */
  get days(): number {
    const raw = Number(this.config.get<string>('RETENTION_DAYS'));
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DAYS;
  }

  /**
   * Sweep on boot and once a day after that. Disabled under test (and by
   * RETENTION=off) so suites stay deterministic and call sweep() themselves —
   * the same arrangement the notification dispatcher uses.
   */
  onModuleInit() {
    const off =
      this.config.get<string>('RETENTION') === 'off' || process.env.NODE_ENV === 'test';
    if (off) return;
    void this.sweep().catch((e) => this.logger.warn(`Retention sweep failed: ${String(e)}`));
    this.timer = setInterval(() => {
      void this.sweep().catch((e) => this.logger.warn(`Retention sweep failed: ${String(e)}`));
    }, SWEEP_INTERVAL_MS);
    // Never hold the process open just for the sweeper.
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Delete boards whose lesson is older than the cutoff, and old snapshots. */
  async sweep(now = new Date()): Promise<{ boards: number; snapshots: number; cutoff: Date }> {
    const cutoff = new Date(now.getTime() - this.days * DAY_MS);

    // Boards are one per lesson, so this list is small; reading it is simpler
    // and more honest than a query that pretends Board.lessonId is a foreign
    // key. It is not one — the board outlives its lesson on purpose.
    const boards = await this.prisma.board.findMany({
      select: { id: true, lessonId: true, updatedAt: true },
    });
    let snapshots = 0;
    let deleted = 0;

    if (boards.length > 0) {
      const lessons = await this.prisma.lesson.findMany({
        where: { id: { in: boards.map((b) => b.lessonId) } },
        select: { id: true, endsAt: true },
      });
      const endsAt = new Map(lessons.map((l) => [l.id, l.endsAt]));
      const expired = boards
        .filter((b) => {
          const end = endsAt.get(b.lessonId);
          // No lesson left to date it by: fall back to the board's own last write.
          return end ? end < cutoff : b.updatedAt < cutoff;
        })
        .map((b) => b.id);

      if (expired.length > 0) {
        // Snapshots carry the board's id and go with it (onDelete: Cascade).
        const res = await this.prisma.board.deleteMany({ where: { id: { in: expired } } });
        deleted = res.count;
      }
    }

    // Version history of a board that is still live: the current drawing stays,
    // the trail of how it got there does not need to outlive the same cutoff.
    const old = await this.prisma.boardSnapshot.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    snapshots = old.count;

    if (deleted > 0 || snapshots > 0) {
      this.logger.log(
        `Retention: deleted ${deleted} board(s) and ${snapshots} snapshot(s) older than ${cutoff.toISOString()}`,
      );
    }
    return { boards: deleted, snapshots, cutoff };
  }
}
