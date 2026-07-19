import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Test helper: wipe all rows (respecting FK order) for a clean slate.
   * Only meant for e2e tests against the SQLite test database.
   */
  async cleanDatabase(): Promise<void> {
    await this.$transaction([
      this.homeworkSubmission.deleteMany(),
      this.homework.deleteMany(),
      this.attendance.deleteMany(),
      this.lessonParticipant.deleteMany(),
      this.lesson.deleteMany(),
      this.tutorNote.deleteMany(),
      this.lessonResult.deleteMany(),
      this.homeworkCard.deleteMany(),
      this.contentAssignment.deleteMany(),
      this.dictionaryEntry.deleteMany(),
      this.wordlistEntry.deleteMany(),
      this.wordlist.deleteMany(),
      this.grammarReference.deleteMany(),
      this.generationRevision.deleteMany(),
      this.generationJob.deleteMany(),
      this.lessonTask.deleteMany(),
      this.pageMedia.deleteMany(),
      this.lessonPage.deleteMany(),
      this.courseLesson.deleteMany(),
      this.unit.deleteMany(),
      this.section.deleteMany(),
      this.course.deleteMany(),
      this.category.deleteMany(),
      this.exerciseInstance.deleteMany(),
      this.exercise.deleteMany(),
      this.telegramLink.deleteMany(),
      this.boardSnapshot.deleteMany(),
      this.board.deleteMany(),
      this.invoice.deleteMany(),
      this.studentPackage.deleteMany(),
      this.ledgerEntry.deleteMany(),
      this.package.deleteMany(),
      this.tutorStudent.deleteMany(),
      this.notification.deleteMany(),
      this.transaction.deleteMany(),
      this.material.deleteMany(),
      this.refreshToken.deleteMany(),
      this.studentProfile.deleteMany(),
      this.tutorProfile.deleteMany(),
      this.user.deleteMany(),
    ]);
  }
}
