import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

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

  // eslint-disable-next-line no-console
  console.log('Seed complete:', {
    tutor: tutor.email,
    students: [student1.email, student2.email],
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
