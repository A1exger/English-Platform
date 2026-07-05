import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ContentService } from './content.service';
import {
  CreateCategoryDto,
  CreateCourseDto,
  CreateCourseLessonDto,
  CreatePageDto,
  CreateSectionDto,
  CreateTaskDto,
  CreateUnitDto,
  ReorderLessonDto,
  UpdateCourseDto,
  UpdateCourseLessonDto,
  UpdateTaskDto,
} from './dto/content.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('content')
export class ContentController {
  constructor(private readonly content: ContentService) {}

  // --- reads (any signed-in role; students see published only) ---

  @Get('catalog')
  catalog(@CurrentUser() user: AuthenticatedUser) {
    return this.content.listCatalog(user);
  }

  @Get('courses/:id/tree')
  tree(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('level') level: string,
  ) {
    return this.content.courseTree(user, id, level);
  }

  @Get('lessons/:id')
  lesson(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.content.lessonDetail(user, id);
  }

  // --- authoring (tutor/admin) ---

  @Roles('tutor', 'admin')
  @Post('categories')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.content.createCategory(dto);
  }

  @Roles('tutor', 'admin')
  @Post('courses')
  createCourse(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCourseDto) {
    return this.content.createCourse(user, dto);
  }

  @Roles('tutor', 'admin')
  @Patch('courses/:id')
  updateCourse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCourseDto,
  ) {
    return this.content.updateCourse(user, id, dto);
  }

  @Roles('tutor', 'admin')
  @Post('sections')
  createSection(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSectionDto) {
    return this.content.createSection(user, dto);
  }

  @Roles('tutor', 'admin')
  @Post('units')
  createUnit(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateUnitDto) {
    return this.content.createUnit(user, dto);
  }

  @Roles('tutor', 'admin')
  @Post('lessons')
  createLesson(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCourseLessonDto) {
    return this.content.createLesson(user, dto);
  }

  @Roles('tutor', 'admin')
  @Patch('lessons/:id')
  updateLesson(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCourseLessonDto,
  ) {
    return this.content.updateLesson(user, id, dto);
  }

  @Roles('tutor', 'admin')
  @Post('lessons/:id/reorder')
  reorderLesson(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReorderLessonDto,
  ) {
    return this.content.reorderLesson(user, id, dto);
  }

  @Roles('tutor', 'admin')
  @Delete('lessons/:id')
  deleteLesson(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.content.deleteLesson(user, id);
  }

  @Roles('tutor', 'admin')
  @Post('pages')
  createPage(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePageDto) {
    return this.content.createPage(user, dto);
  }

  @Roles('tutor', 'admin')
  @Post('tasks')
  createTask(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTaskDto) {
    return this.content.createTask(user, dto);
  }

  @Roles('tutor', 'admin')
  @Patch('tasks/:id')
  updateTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.content.updateTask(user, id, dto);
  }

  @Roles('tutor', 'admin')
  @Delete('tasks/:id')
  deleteTask(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.content.deleteTask(user, id);
  }
}
