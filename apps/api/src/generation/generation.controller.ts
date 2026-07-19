import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { GenerationService } from './generation.service';
import { GenerateDto, ReviseDto } from './dto/generate.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload';

// AI course generation (SPEC §8). tutor/admin only.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('tutor', 'admin')
@Controller('content/generate')
export class GenerationController {
  constructor(private readonly generation: GenerationService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: GenerateDto) {
    return this.generation.create(user, dto);
  }

  @Get(':jobId')
  status(@CurrentUser() user: AuthenticatedUser, @Param('jobId') jobId: string) {
    return this.generation.status(user, jobId);
  }

  @Post(':jobId/revise')
  revise(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId') jobId: string,
    @Body() dto: ReviseDto,
  ) {
    return this.generation.revise(user, jobId, dto.scope, dto.instruction);
  }

  @Post(':jobId/approve')
  approve(@CurrentUser() user: AuthenticatedUser, @Param('jobId') jobId: string) {
    return this.generation.approve(user, jobId);
  }

  @Delete(':jobId')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('jobId') jobId: string) {
    return this.generation.remove(user, jobId);
  }
}
