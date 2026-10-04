import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RetentionService } from '../src/retention/retention.service';

// What a whiteboard holds — a student's sentences, their mistakes, the shared
// notepad — is personal data with no use six months after the lesson. These
// tests pin the two halves of the rule: what goes, and what must not.
describe('Retention: boards and snapshots (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let retention: RetentionService;

  const DAY = 86_400_000;
  const ago = (days: number) => new Date(Date.now() - days * DAY);
  const ahead = (days: number) => new Date(Date.now() + days * DAY);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    retention = app.get(RetentionService);
    await prisma.cleanDatabase();
  });

  afterAll(async () => {
    await prisma.cleanDatabase();
    await app.close();
  });

  const makeLesson = async (endsAt: Date) => {
    const user = await prisma.user.create({
      data: {
        email: `t${Math.random().toString(36).slice(2)}@test.com`,
        passwordHash: 'x',
        role: 'tutor',
        firstName: 'T',
        lastName: 'T',
      },
    });
    const tutor = await prisma.tutorProfile.create({ data: { userId: user.id } });
    return prisma.lesson.create({
      data: {
        tutorProfileId: tutor.id,
        startsAt: new Date(endsAt.getTime() - 3_600_000),
        endsAt,
      },
    });
  };

  it('deletes a board six months after its lesson, and keeps a recent one', async () => {
    const oldLesson = await makeLesson(ago(200));
    const recentLesson = await makeLesson(ago(30));
    const futureLesson = await makeLesson(ahead(7));

    const stale = await prisma.board.create({
      data: { lessonId: oldLesson.id, latestSnapshot: '{"old":true}', notes: 'last spring' },
    });
    const live = await prisma.board.create({
      data: { lessonId: recentLesson.id, latestSnapshot: '{"recent":true}' },
    });
    // A board made long ago for a lesson that has not happened yet: dated by the
    // lesson, not by the row, so it stays.
    const planned = await prisma.board.create({
      data: { lessonId: futureLesson.id, latestSnapshot: '{"planned":true}' },
    });
    await prisma.$executeRaw`UPDATE "Board" SET "updatedAt" = ${ago(300)} WHERE "id" = ${planned.id}`;

    await prisma.boardSnapshot.create({ data: { boardId: stale.id, snapshot: '{}' } });
    const keptSnap = await prisma.boardSnapshot.create({ data: { boardId: live.id, snapshot: '{}' } });
    const oldSnapOnLiveBoard = await prisma.boardSnapshot.create({
      data: { boardId: live.id, snapshot: '{}', createdAt: ago(200) },
    });

    const res = await retention.sweep();
    expect(res.boards).toBe(1);

    const left = await prisma.board.findMany({ select: { id: true } });
    const ids = left.map((b) => b.id);
    expect(ids).not.toContain(stale.id);
    expect(ids).toContain(live.id);
    expect(ids).toContain(planned.id);

    // The stale board's history went with it; the live board keeps its current
    // snapshot but loses the trail older than the cutoff.
    const snaps = await prisma.boardSnapshot.findMany({ select: { id: true } });
    const snapIds = snaps.map((s) => s.id);
    expect(snapIds).toContain(keptSnap.id);
    expect(snapIds).not.toContain(oldSnapOnLiveBoard.id);
  });

  it('is idempotent: a second sweep finds nothing left to do', async () => {
    const res = await retention.sweep();
    expect(res.boards).toBe(0);
    expect(res.snapshots).toBe(0);
  });

  it('an orphaned board is dated by its own last write', async () => {
    const orphan = await prisma.board.create({
      data: { lessonId: 'lesson-that-never-existed', latestSnapshot: '{}' },
    });
    await prisma.$executeRaw`UPDATE "Board" SET "updatedAt" = ${ago(400)} WHERE "id" = ${orphan.id}`;
    const res = await retention.sweep();
    expect(res.boards).toBe(1);
    expect(await prisma.board.findUnique({ where: { id: orphan.id } })).toBeNull();
  });
});
