// One-off maintenance: add markup to lesson text written before RichText.
//
//   node dist/scripts/remark-pages.js          # report only, writes nothing
//   node dist/scripts/remark-pages.js --apply  # write the changes
//
// Dry-run is the default on purpose: this edits a tutor's own writing, so the
// first run is a proposal to read, not a change to discover afterwards. The
// rules and what they refuse to guess at live in ../content/remark-text.ts.

import { PrismaClient } from '@prisma/client';
import { remarkText, TextShape } from '../content/remark-text';

const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient();

/** A short one-line preview, with newlines made visible. */
const preview = (s: string, n = 96) =>
  (s.length > n ? `${s.slice(0, n)}…` : s).replace(/\n/g, '⏎');

async function main() {
  const pages = await prisma.lessonPage.findMany({
    where: { text: { not: null } },
    orderBy: { order: 'asc' },
    include: {
      courseLesson: {
        include: { wordlist: { include: { entries: true } } },
      },
    },
  });

  const shapes: Record<TextShape, number> = {
    paragraphs: 0,
    'line-breaks': 0,
    'one-run': 0,
    empty: 0,
  };
  const needsHuman: { id: string; lesson: string; text: string }[] = [];
  let changed = 0;

  for (const page of pages) {
    const words = (page.courseLesson.wordlist?.entries ?? []).map((e) => e.word);
    const r = remarkText(page.text, words);
    shapes[r.shape]++;

    if (r.shape === 'one-run') {
      needsHuman.push({
        id: page.id,
        lesson: page.courseLesson.title,
        text: page.text ?? '',
      });
      continue;
    }
    if (r.text === (page.text ?? '').replace(/\r\n/g, '\n').trim()) continue;

    changed++;
    const what = [
      r.paragraphs ? `${r.paragraphs} paragraph break(s)` : '',
      r.headings ? `${r.headings} heading(s)` : '',
      r.bolded.length ? `bold: ${r.bolded.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join(', ');
    console.log(`\n${page.courseLesson.title} · ${page.type} · ${page.id}`);
    console.log(`  ${what}`);
    console.log(`  before: ${preview(page.text ?? '')}`);
    console.log(`  after:  ${preview(r.text)}`);

    if (APPLY) {
      await prisma.lessonPage.update({ where: { id: page.id }, data: { text: r.text } });
    }
  }

  console.log(`\n${'—'.repeat(64)}`);
  console.log(`pages with text: ${pages.length}`);
  console.log(`  already has blank lines: ${shapes.paragraphs}`);
  console.log(`  line breaks only:        ${shapes['line-breaks']}`);
  console.log(`  one unbroken run:        ${shapes['one-run']}`);
  console.log(`${APPLY ? 'rewritten' : 'would rewrite'}: ${changed}`);

  if (needsHuman.length) {
    console.log(
      `\n${needsHuman.length} page(s) arrive as a single unbroken run. Splitting prose at\n` +
        `sentence boundaries guesses where a thought ends, so these are left alone —\n` +
        `open them in the course builder and put a blank line between paragraphs:`,
    );
    for (const p of needsHuman) {
      console.log(`  ${p.lesson} · ${p.id}`);
      console.log(`    ${preview(p.text, 120)}`);
    }
  }
  if (!APPLY && changed) {
    console.log('\nNothing was written. Re-run with --apply to keep these changes.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
