// One-off maintenance: move finished assignments that nobody has read yet from
// "done" to "needs_review".
//
//   node dist/scripts/restatus-assignments.js          # report only, writes nothing
//   node dist/scripts/restatus-assignments.js --apply  # write the changes
//
// "done" used to mean "the student handed in every card", so an essay was
// marked finished the moment it was written and a tutor returning a week later
// could not tell which work they had already read. It now means "and the tutor
// has graded it". Rows written under the old rule need the distinction applied
// to them once; new ones get it from the service.
//
// Only ever moves done -> needs_review. An assignment the student has not
// finished is left alone, and so is one whose essays are all graded: those
// already say what they mean.

import { PrismaClient } from '@prisma/client';

const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient();

interface Snapshot {
  gradingMode?: string;
}

async function main() {
  const done = await prisma.contentAssignment.findMany({
    where: { status: 'done' },
    include: { cards: { select: { status: true, score: true, taskSnapshot: true } } },
  });
  if (done.length === 0) {
    console.log('No assignments marked done. Nothing to do.');
    return;
  }

  // A card needs a human when it was graded by one by design and carries no
  // number yet. A snapshot that will not parse is treated as already fine:
  // this script is not the place to discover corrupt rows, and guessing would
  // put work back into a tutor's queue for no reason.
  const needsReview = (card: { status: string; score: number | null; taskSnapshot: string }) => {
    if (card.status !== 'submitted' || card.score !== null) return false;
    try {
      return (JSON.parse(card.taskSnapshot) as Snapshot).gradingMode === 'MANUAL';
    } catch {
      return false;
    }
  };

  const stale = done.filter((a) => a.cards.some(needsReview));
  console.log(`${done.length} assignment(s) marked done; ${stale.length} still unread.`);
  for (const a of stale) {
    const waiting = a.cards.filter(needsReview).length;
    console.log(`  ${a.id}  ${a.topicTag ?? '(no topic)'}  — ${waiting} task(s) awaiting review`);
  }

  if (stale.length === 0) return;
  if (!APPLY) {
    console.log('\nReport only. Re-run with --apply to write.');
    return;
  }

  const res = await prisma.contentAssignment.updateMany({
    where: { id: { in: stale.map((a) => a.id) } },
    data: { status: 'needs_review' },
  });
  console.log(`\nMoved ${res.count} assignment(s) to needs_review.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
