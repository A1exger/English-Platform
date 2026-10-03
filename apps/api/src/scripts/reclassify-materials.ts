// One-off maintenance: take course media out of the Materials library.
//
//   node dist/scripts/reclassify-materials.js          # report only, writes nothing
//   node dist/scripts/reclassify-materials.js --apply  # write the changes
//
// Every upload used to become a library item, so a picture dropped onto a
// lesson page, a course cover and an exercise's image all turned up on the
// shelf a tutor curates. New uploads now say which they are (Material.scope);
// this reclassifies the ones made before that.
//
// A row is moved only when its file is demonstrably embedded in content — its
// URL appears in a course cover, a page's media, or a task's payload. Anything
// else stays in the library, because a file nothing references may well be a
// teaching material a tutor uploaded and has not attached yet, and quietly
// hiding those would be the same mistake in the other direction.

import { PrismaClient } from '@prisma/client';

const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient();

async function main() {
  const candidates = await prisma.material.findMany({
    where: { scope: 'library', url: { not: null } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, title: true, type: true, url: true, createdAt: true },
  });
  if (candidates.length === 0) {
    console.log('No library materials with a file. Nothing to do.');
    return;
  }

  // Where a URL can be embedded. The first three are plain columns; the task
  // payloads are JSON strings, so they are searched as text — a URL is a long
  // unique token ("/uploads/<uuid>.jpg"), which makes a substring match exact
  // enough without parsing every payload shape the platform has ever written.
  const [covers, pages, media, lessonTasks, exercises] = await Promise.all([
    prisma.course.findMany({ where: { coverUrl: { not: null } }, select: { coverUrl: true } }),
    prisma.lessonPage.findMany({ where: { mediaUrl: { not: null } }, select: { mediaUrl: true } }),
    prisma.pageMedia.findMany({ select: { url: true } }),
    prisma.lessonTask.findMany({ select: { payload: true } }),
    prisma.exercise.findMany({ select: { payload: true } }),
  ]);

  const exact = new Set<string>();
  for (const c of covers) if (c.coverUrl) exact.add(c.coverUrl);
  for (const p of pages) if (p.mediaUrl) exact.add(p.mediaUrl);
  for (const m of media) exact.add(m.url);
  const payloads = [...lessonTasks, ...exercises].map((t) => t.payload).filter(Boolean);

  const where = (url: string): string | null => {
    if (exact.has(url)) return 'embedded in a course, page or media row';
    if (payloads.some((p) => p.includes(url))) return 'embedded in an exercise payload';
    return null;
  };

  const found: { id: string; title: string; type: string; url: string; why: string }[] = [];
  for (const m of candidates) {
    const why = where(m.url as string);
    if (why) found.push({ id: m.id, title: m.title, type: m.type, url: m.url as string, why });
  }

  console.log(`${candidates.length} library material(s) with a file; ${found.length} are course media.`);
  for (const f of found) console.log(`  ${f.type.padEnd(6)} ${f.title} — ${f.why}`);

  if (found.length === 0) return;
  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to move these out of the library.');
    return;
  }
  const res = await prisma.material.updateMany({
    where: { id: { in: found.map((f) => f.id) } },
    data: { scope: 'inline' },
  });
  console.log(`\nMoved ${res.count} material(s) out of the library. The files themselves are untouched.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
