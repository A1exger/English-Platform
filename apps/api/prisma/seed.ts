import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const password = await bcrypt.hash('Password123!', 10);

  // Tutor
  const tutor = await prisma.user.upsert({
    where: { email: 'tutor@example.com' },
    update: {},
    create: {
      email: 'tutor@example.com',
      passwordHash: password,
      role: 'tutor',
      firstName: 'Tessa',
      lastName: 'Tutor',
      locale: 'en',
      timezone: 'Europe/Berlin',
      tutorProfile: {
        create: {
          headline: 'Certified English tutor (CELTA)',
          bio: 'Helping learners speak confidently for 8+ years.',
          hourlyRate: 25,
          currency: 'EUR',
        },
      },
    },
    include: { tutorProfile: true },
  });

  // Platform admin (cannot be created via public sign-up)
  await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      passwordHash: password,
      role: 'admin',
      firstName: 'Ada',
      lastName: 'Admin',
      locale: 'en',
      timezone: 'UTC',
    },
  });

  // Student 1 (Russian locale)
  const student1 = await prisma.user.upsert({
    where: { email: 'student.ru@example.com' },
    update: {},
    create: {
      email: 'student.ru@example.com',
      passwordHash: password,
      role: 'student',
      firstName: 'Ivan',
      lastName: 'Petrov',
      locale: 'ru',
      timezone: 'Europe/Moscow',
      studentProfile: {
        create: {
          cefrLevel: 'B1',
          goals: 'Improve speaking for work',
          nativeLanguage: 'Russian',
        },
      },
    },
    include: { studentProfile: true },
  });

  // Student 2 (Arabic locale)
  const student2 = await prisma.user.upsert({
    where: { email: 'student.ar@example.com' },
    update: {},
    create: {
      email: 'student.ar@example.com',
      passwordHash: password,
      role: 'student',
      firstName: 'Sara',
      lastName: 'Al-Amin',
      locale: 'ar',
      timezone: 'Asia/Dubai',
      studentProfile: {
        create: {
          cefrLevel: 'A2',
          goals: 'Prepare for IELTS',
          nativeLanguage: 'Arabic',
        },
      },
    },
    include: { studentProfile: true },
  });

  const tutorProfileId = tutor.tutorProfile!.id;

  // Link students to tutor
  await prisma.tutorStudent.upsert({
    where: {
      tutorProfileId_studentProfileId: {
        tutorProfileId,
        studentProfileId: student1.studentProfile!.id,
      },
    },
    update: {},
    create: {
      tutorProfileId,
      studentProfileId: student1.studentProfile!.id,
    },
  });
  await prisma.tutorStudent.upsert({
    where: {
      tutorProfileId_studentProfileId: {
        tutorProfileId,
        studentProfileId: student2.studentProfile!.id,
      },
    },
    update: {},
    create: {
      tutorProfileId,
      studentProfileId: student2.studentProfile!.id,
    },
  });

  const now = Date.now();
  const hour = 60 * 60 * 1000;

  // Individual lesson for student1
  await prisma.lesson.create({
    data: {
      tutorProfileId,
      type: 'individual',
      title: 'Conversation practice',
      startsAt: new Date(now + 24 * hour),
      endsAt: new Date(now + 25 * hour),
      priceCents: 2500,
      currency: 'EUR',
      participants: {
        create: { studentProfileId: student1.studentProfile!.id },
      },
    },
  });

  // Group/trial lesson with open slot
  await prisma.lesson.create({
    data: {
      tutorProfileId,
      type: 'group',
      title: 'Beginner group class',
      startsAt: new Date(now + 48 * hour),
      endsAt: new Date(now + 49 * hour),
      priceCents: 1000,
      currency: 'EUR',
      participants: {
        create: { studentProfileId: student2.studentProfile!.id },
      },
    },
  });

  // Lesson packages (tariffs) for the tutor — created once.
  const existingPackages = await prisma.package.count({
    where: { tutorProfileId },
  });
  if (existingPackages === 0) {
    await prisma.package.createMany({
      data: [
        {
          tutorProfileId,
          name: '5 lessons',
          lessonsCount: 5,
          priceCents: 11000,
          currency: 'EUR',
          validityDays: 90,
        },
        {
          tutorProfileId,
          name: '10 lessons',
          lessonsCount: 10,
          priceCents: 20000,
          currency: 'EUR',
          validityDays: 180,
        },
      ],
    });
  }

  // --- Demo course content (Category -> Course -> Section -> Unit -> Lessons)
  const existingCourse = await prisma.course.findFirst({
    where: { title: 'General English' },
  });
  if (!existingCourse) {
    const category = await prisma.category.create({
      data: { title: 'General', order: 0 },
    });
    const course = await prisma.course.create({
      data: {
        categoryId: category.id,
        title: 'General English',
        status: 'published',
        ownerUserId: tutor.id,
      },
    });
    const level = 'Elementary';
    const section = await prisma.section.create({
      data: { courseId: course.id, level, title: 'Everyday life', order: 0 },
    });
    const unit1 = await prisma.unit.create({
      data: { sectionId: section.id, title: 'Daily routines', order: 0 },
    });
    const unit2 = await prisma.unit.create({
      data: { sectionId: section.id, title: 'Food & drinks', order: 1 },
    });

    // INV-1: order is level-wide across units; INV-2: lesson 3 is optional.
    const lesson1 = await prisma.courseLesson.create({
      data: {
        courseId: course.id,
        level,
        unitId: unit1.id,
        title: 'Present Simple: my day',
        order: 1,
        objectives: JSON.stringify([
          'Talk about your daily routine',
          'Use Present Simple with I/you/we/they',
        ]),
      },
    });
    await prisma.courseLesson.create({
      data: {
        courseId: course.id,
        level,
        unitId: unit1.id,
        title: 'Telling the time',
        order: 2,
      },
    });
    await prisma.courseLesson.create({
      data: {
        courseId: course.id,
        level,
        unitId: unit2.id,
        title: 'Extra practice: food vocabulary',
        order: 3,
        optional: true, // INV-2: graded but excluded from courseCompletion
      },
    });

    await prisma.wordlist.create({
      data: {
        courseLessonId: lesson1.id,
        entries: {
          create: [
            { word: 'wake up', translation: 'просыпаться', order: 0 },
            { word: 'have breakfast', translation: 'завтракать', order: 1 },
            { word: 'commute', translation: 'добираться до работы', order: 2 },
          ],
        },
      },
    });
    await prisma.grammarReference.create({
      data: {
        courseLessonId: lesson1.id,
        title: 'Present Simple',
        meaning: 'Regular habits and routines: things you do every day/week.',
        form: 'I/you/we/they + verb; he/she/it + verb+s. Negative: do/does + not.',
      },
    });

    const page = await prisma.lessonPage.create({
      data: {
        courseLessonId: lesson1.id,
        type: 'practice',
        order: 0,
        includedInHomework: true,
      },
    });
    await prisma.lessonTask.createMany({
      data: [
        {
          pageId: page.id,
          type: 'sentence_ordering',
          gradingMode: 'AUTO',
          aspect: 'Grammar',
          estimatedMinutes: 3,
          order: 0,
          payload: JSON.stringify({ words: ['I', 'wake', 'up', 'at', 'seven'] }),
          answerKey: JSON.stringify({ order: ['I', 'wake', 'up', 'at', 'seven'] }),
        },
        {
          pageId: page.id,
          type: 'gap_fill',
          gradingMode: 'AUTO',
          aspect: 'Grammar',
          estimatedMinutes: 4,
          order: 1,
          payload: JSON.stringify({ text: 'She [wakes] up early and [has] breakfast.' }),
          answerKey: JSON.stringify({ answers: ['wakes', 'has'] }),
        },
        {
          pageId: page.id,
          type: 'word_matching',
          gradingMode: 'AUTO',
          aspect: 'Vocabulary',
          estimatedMinutes: 3,
          order: 2,
          payload: JSON.stringify({
            pairs: [
              { left: 'wake up', right: 'просыпаться' },
              { left: 'commute', right: 'добираться' },
            ],
          }),
          answerKey: JSON.stringify({
            map: { 'wake up': 'просыпаться', commute: 'добираться' },
          }),
        },
        {
          pageId: page.id,
          type: 'categorization',
          gradingMode: 'AUTO',
          aspect: 'Vocabulary',
          estimatedMinutes: 4,
          order: 3,
          payload: JSON.stringify({
            categories: ['morning', 'evening'],
            items: [
              { text: 'have breakfast', category: 'morning' },
              { text: 'go to bed', category: 'evening' },
            ],
          }),
          answerKey: JSON.stringify({
            placement: { 'have breakfast': 'morning', 'go to bed': 'evening' },
          }),
        },
        {
          pageId: page.id,
          type: 'multiple_choice',
          gradingMode: 'AUTO',
          aspect: 'Reading',
          estimatedMinutes: 2,
          order: 4,
          payload: JSON.stringify({
            question: 'He ___ up at 6.',
            options: ['wake', 'wakes', 'waking'],
          }),
          answerKey: JSON.stringify({ correct: 'wakes' }),
        },
        {
          pageId: page.id,
          type: 'essay',
          gradingMode: 'MANUAL',
          aspect: 'Writing',
          estimatedMinutes: 15,
          order: 5,
          payload: JSON.stringify({ prompt: 'Describe your typical day (5–7 sentences).' }),
        },
        {
          pageId: page.id,
          type: 'discussion',
          gradingMode: 'COMPLETION',
          aspect: 'Speaking',
          estimatedMinutes: 10,
          order: 6,
          payload: JSON.stringify({ prompt: 'Discuss: is routine good or boring?' }),
        },
      ],
    });
  }

  // eslint-disable-next-line no-console
  console.log('Seed complete:', {
    admin: 'admin@example.com',
    tutor: tutor.email,
    students: [student1.email, student2.email],
    demoCourse: 'General English (Elementary): 2 required + 1 optional lesson',
  });
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
