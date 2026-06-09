import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CrmService } from './crm.service';
import { AddStudentDto } from './dto/add-student.dto';
import { CreateNoteDto } from './dto/create-note.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload';

// The CRM is the tutor's view of their students; all routes are tutor-only.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('tutor')
@Controller('crm')
export class CrmController {
  constructor(private readonly crm: CrmService) {}

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
