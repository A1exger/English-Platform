import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AssignmentsService } from './assignments.service';
import {
  CreateAssignmentDto,
  GradeCardDto,
  SubmitCardDto,
} from './dto/assignment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('assignments')
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  // Teacher assembles homework/lesson from a lesson's tasks or a task pool,
  // snapshotting the content at assignment time (INV-7).
  @Roles('tutor', 'admin')
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAssignmentDto) {
    return this.assignments.createAssignment(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.assignments.listForUser(user);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.assignments.getOne(user, id);
  }

  // Student submits one card; AUTO is scored server-side (INV-5).
  @Roles('student')
  @Post('cards/:id/submit')
  submitCard(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SubmitCardDto,
  ) {
    return this.assignments.submitCard(user, id, dto);
  }

  // Teacher grades/feeds back a MANUAL (essay) card.
  @Roles('tutor', 'admin')
  @Post('cards/:id/grade')
  gradeCard(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: GradeCardDto,
  ) {
    return this.assignments.gradeCard(user, id, dto);
  }
}
