import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types/jwt-payload';
import { CreateMaterialDto } from './dto/create-material.dto';

@Injectable()
export class MaterialsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Create a Material from an uploaded file (served from /uploads). */
  createUploaded(
    user: AuthenticatedUser,
    file: Express.Multer.File,
    title?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    const mime = file.mimetype || '';
    const type = mime.startsWith('image/')
      ? 'image'
      : mime.startsWith('audio/')
        ? 'audio'
        : mime.startsWith('video/')
          ? 'video'
          : mime === 'application/pdf'
            ? 'pdf'
            : 'link';
    return this.prisma.material.create({
      data: {
        ownerUserId: user.id,
        type,
        title: title || file.originalname,
        url: `/uploads/${file.filename}`,
      },
    });
  }

  create(user: AuthenticatedUser, dto: CreateMaterialDto) {
    // Materials keep the language of the original content; the platform UI is
    // localized separately and never auto-translates teaching materials.
    return this.prisma.material.create({
      data: {
        ownerUserId: user.id,
        type: dto.type,
        title: dto.title,
        url: dto.url,
        language: dto.language,
      },
    });
  }

  /**
   * Tutors see their own library. Students see materials owned by the tutors
   * they are enrolled with (read-only), so a tutor can share a library.
   */
  async list(user: AuthenticatedUser) {
    if (user.role === 'student') {
      const tutorUserIds = await this.enrolledTutorUserIds(user.id);
      return this.prisma.material.findMany({
        where: { ownerUserId: { in: tutorUserIds } },
        orderBy: { createdAt: 'desc' },
      });
    }
    return this.prisma.material.findMany({
      where: { ownerUserId: user.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOne(user: AuthenticatedUser, id: string) {
    const material = await this.prisma.material.findUnique({ where: { id } });
    if (!material) {
      throw new NotFoundException('Material not found');
    }
    if (material.ownerUserId === user.id || user.role === 'admin') {
      return material;
    }
    if (user.role === 'student') {
      const tutorUserIds = await this.enrolledTutorUserIds(user.id);
      if (tutorUserIds.includes(material.ownerUserId)) {
        return material;
      }
    }
    throw new ForbiddenException('Not allowed to access this material');
  }

  async remove(user: AuthenticatedUser, id: string) {
    const material = await this.prisma.material.findUnique({ where: { id } });
    if (!material) {
      throw new NotFoundException('Material not found');
    }
    if (material.ownerUserId !== user.id && user.role !== 'admin') {
      throw new ForbiddenException('Not your material');
    }
    await this.prisma.material.delete({ where: { id } });
    return { deleted: true };
  }

  private async enrolledTutorUserIds(studentUserId: string): Promise<string[]> {
    const student = await this.prisma.studentProfile.findUnique({
      where: { userId: studentUserId },
    });
    if (!student) {
      return [];
    }
    const links = await this.prisma.tutorStudent.findMany({
      where: { studentProfileId: student.id, status: 'active' },
      include: { tutorProfile: true },
    });
    return links.map((l) => l.tutorProfile.userId);
  }
}
