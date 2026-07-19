import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ContentService } from './content.service';
import {
  AddDictionaryDto,
  CheckTaskDto,
  CreateCategoryDto,
  CreateCourseDto,
  CreateCourseLessonDto,
  CreatePageDto,
  CreateSectionDto,
  CreateTaskDto,
  CreateUnitDto,
  ReorderCategoriesDto,
  ReorderCoursesDto,
  ReorderLessonDto,
  ReviewDictionaryDto,
  SetGrammarDto,
  SetWordlistDto,
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

  // Server-side task check (AUTO scores 0-10; MANUAL/COMPLETION -> completed).
  @Post('tasks/:id/check')
  checkTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CheckTaskDto,
  ) {
    return this.content.checkTask(user, id, dto.state);
  }

  // Personal dictionary (Preparation -> "add to dictionary").
  @Roles('student')
  @Post('dictionary')
  addDictionary(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddDictionaryDto,
  ) {
    return this.content.addDictionaryEntry(user, dto);
  }

  @Roles('student')
  @Get('dictionary')
  listDictionary(@CurrentUser() user: AuthenticatedUser) {
    return this.content.listDictionary(user);
  }

  // Spaced-repetition review of one dictionary word.
  @Roles('student')
  @Post('dictionary/:id/review')
  reviewDictionary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReviewDictionaryDto,
  ) {
    return this.content.reviewDictionaryEntry(user, id, dto.remembered);
  }

  // Both progress counters + goal forecast for the cabinet (INV-3).
  @Roles('student')
  @Get('progress')
  progress(@CurrentUser() user: AuthenticatedUser) {
    return this.content.studentProgress(user);
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

  // Drag-reorder persistence (ФТ-К104). POST /reorder never clashes with the
  // PATCH :id / POST create routes above.
  @Roles('tutor', 'admin')
  @Post('categories/reorder')
  reorderCategories(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReorderCategoriesDto) {
    return this.content.reorderCategories(user, dto.ids);
  }

  @Roles('tutor', 'admin')
  @Post('courses/reorder')
  reorderCourses(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReorderCoursesDto) {
    return this.content.reorderCourses(user, dto.categoryId, dto.ids);
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
  @Put('lessons/:id/wordlist')
  setWordlist(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetWordlistDto,
  ) {
    return this.content.setWordlist(user, id, dto.entries);
  }

  @Roles('tutor', 'admin')
  @Put('lessons/:id/grammar')
  setGrammar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetGrammarDto,
  ) {
    return this.content.setGrammarReference(user, id, dto);
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
