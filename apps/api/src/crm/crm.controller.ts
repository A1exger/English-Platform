import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CrmService } from './crm.service';
import { AddStudentDto } from './dto/add-student.dto';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload';

// CRM: tutors manage their own students; admins see/edit all of them.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('tutor', 'admin')
@Controller('crm')
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  // Enrolling a student under yourself only makes sense for a tutor.
  @Roles('tutor')
  @Post('students')
  addStudent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddStudentDto,
  ) {
    return this.crm.addStudent(user, dto);
  }

  @Get('students')
  listStudents(@CurrentUser() user: AuthenticatedUser) {
    return this.crm.listStudents(user);
  }

  @Get('students/:studentProfileId')
  getStudentCard(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studentProfileId') studentProfileId: string,
  ) {
    return this.crm.getStudentCard(user, studentProfileId);
  }

  @Patch('students/:studentProfileId')
  updateStudent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studentProfileId') studentProfileId: string,
    @Body() dto: UpdateStudentDto,
  ) {
    return this.crm.updateStudent(user, studentProfileId, dto);
  }

  @Roles('tutor')
  @Post('students/:studentProfileId/notes')
  addNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studentProfileId') studentProfileId: string,
    @Body() dto: CreateNoteDto,
  ) {
    return this.crm.addNote(user, studentProfileId, dto);
  }

  @Get('students/:studentProfileId/notes')
  listNotes(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studentProfileId') studentProfileId: string,
  ) {
    return this.crm.listNotes(user, studentProfileId);
  }
}
