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
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ContentService } from './content.service';
import { AiUnavailableError } from '../generation/ai-client';
import {
  AddDictionaryDto,
  CheckTaskDto,
  CreateCategoryDto,
  CreateCourseDto,
  CreateCourseLessonDto,
  CreatePageDto,
  CreatePageMediaDto,
  CreateSectionDto,
  CreateTaskDto,
  CreateUnitDto,
  ImportWordBankDto,
  RenameNodeDto,
  ReorderCategoriesDto,
  ReorderCoursesDto,
  ReorderLessonDto,
  ReorderMediaDto,
  ReorderPagesDto,
  ReorderSectionsDto,
  ReorderTasksDto,
  ReorderUnitsDto,
  ReviewDictionaryDto,
  UpdatePageDto,
  UpdatePageMediaDto,
  SetCourseAccessDto,
  SetGrammarDto,
  SetWordlistDto,
  SetWordlistTranslationsDto,
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
  lesson(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('edit') edit?: string,
  ) {
    return this.content.lessonDetail(user, id, edit === '1' || edit === 'true');
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

  // --- shared word bank -----------------------------------------------------
  // Tutors curate it; students read it and copy words into their own dictionary.

  @Get('word-bank')
  wordBank(@Query('q') q?: string, @Query('topic') topic?: string) {
    return this.content.listWordBank(q, topic);
  }

  @Get('word-bank/topics')
  wordBankTopics() {
    return this.content.wordBankTopics();
  }

  @Roles('tutor', 'admin')
  @Post('word-bank/import')
  importWordBank(@Body() dto: ImportWordBankDto) {
    return this.content.importWordBank(dto.text, dto.topic);
  }

  // Free Dictionary API enrichment (no key, no quota). English definitions only.
  @Roles('tutor', 'admin')
  @Get('word-bank/lookup')
  lookupWord(@Query('word') word: string) {
    return this.content.lookupWord(word ?? '');
  }

  @Roles('tutor', 'admin')
  @Delete('word-bank/:id')
  deleteWordBankEntry(@Param('id') id: string) {
    return this.content.deleteWordBankEntry(id);
  }

  @Roles('student')
  @Post('word-bank/:id/add')
  addFromWordBank(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.content.addFromWordBank(user, id);
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
  @Post('sections/reorder')
  reorderSections(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReorderSectionsDto) {
    return this.content.reorderSections(user, dto.courseId, dto.ids);
  }

  @Roles('tutor', 'admin')
  @Post('units/reorder')
  reorderUnits(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReorderUnitsDto) {
    return this.content.reorderUnits(user, dto.sectionId, dto.ids);
  }

  @Roles('tutor', 'admin')
  @Post('pages/reorder')
  reorderPages(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReorderPagesDto) {
    return this.content.reorderPages(user, dto.courseLessonId, dto.ids);
  }

  @Roles('tutor', 'admin')
  @Post('tasks/reorder')
  reorderTasks(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReorderTasksDto) {
    return this.content.reorderTasks(user, dto.pageId, dto.ids);
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
  @Delete('courses/:id')
  deleteCourse(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.content.deleteCourse(user, id);
  }

  // Who an individual (visibility = "private") course is shared with.
  @Roles('tutor', 'admin')
  @Get('courses/:id/access')
  listCourseAccess(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.content.listCourseAccess(user, id);
  }

  @Roles('tutor', 'admin')
  @Put('courses/:id/access')
  setCourseAccess(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetCourseAccessDto,
  ) {
    return this.content.setCourseAccess(user, id, dto.studentProfileIds);
  }

  @Roles('tutor', 'admin')
  @Post('sections')
  createSection(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSectionDto) {
    return this.content.createSection(user, dto);
  }

  // One-off repair for content generated before the AI pipeline emitted answer
  // keys. Admin-only and idempotent — it only fills keys that are missing.
  @Roles('admin')
  @Post('tasks/backfill-answer-keys')
  backfillAnswerKeys(@CurrentUser() user: AuthenticatedUser) {
    return this.content.backfillAnswerKeys(user);
  }

  @Roles('tutor', 'admin')
  @Patch('sections/:id')
  renameSection(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RenameNodeDto,
  ) {
    return this.content.renameSection(user, id, dto.title);
  }

  @Roles('tutor', 'admin')
  @Delete('sections/:id')
  deleteSection(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.content.deleteSection(user, id);
  }

  @Roles('tutor', 'admin')
  @Post('units')
  createUnit(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateUnitDto) {
    return this.content.createUnit(user, dto);
  }

  @Roles('tutor', 'admin')
  @Patch('units/:id')
  renameUnit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RenameNodeDto,
  ) {
    return this.content.renameUnit(user, id, dto.title);
  }

  @Roles('tutor', 'admin')
  @Delete('units/:id')
  deleteUnit(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.content.deleteUnit(user, id);
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

  // AI-translate the lesson wordlist into every supported locale (V2).
  @Roles('tutor', 'admin')
  @Post('lessons/:id/translate-wordlist')
  async translateWordlist(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    try {
      return await this.content.translateWordlist(user, id);
    } catch (e) {
      if (e instanceof AiUnavailableError) {
        throw new ServiceUnavailableException(e.message);
      }
      throw e;
    }
  }

  // Manually edit the per-locale wordlist translations (V3).
  @Roles('tutor', 'admin')
  @Put('lessons/:id/wordlist-translations')
  setWordlistTranslations(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetWordlistTranslationsDto,
  ) {
    return this.content.setWordlistTranslations(user, id, dto.entries);
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
  @Patch('pages/:id')
  updatePage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePageDto,
  ) {
    return this.content.updatePage(user, id, dto);
  }

  // --- page media (§7) ---

  @Roles('tutor', 'admin')
  @Post('pages/:id/media')
  addMedia(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreatePageMediaDto,
  ) {
    return this.content.addPageMedia(user, id, dto);
  }

  @Roles('tutor', 'admin')
  @Post('pages/:id/media/reorder')
  reorderMedia(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReorderMediaDto,
  ) {
    return this.content.reorderPageMedia(user, id, dto.ids);
  }

  @Roles('tutor', 'admin')
  @Patch('media/:id')
  updateMedia(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePageMediaDto,
  ) {
    return this.content.updatePageMedia(user, id, dto);
  }

  @Roles('tutor', 'admin')
  @Delete('media/:id')
  deleteMedia(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.content.deletePageMedia(user, id);
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
