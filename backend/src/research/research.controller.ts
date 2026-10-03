import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PlatformRole, ResearchItemType } from '../../generated/prisma/client';
import { CurrentUser, Public, RequireRole } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  ClaimContributorDto,
  LinkContributorDto,
  ReviewContributorMatchDto,
} from './dto/contributor-match.dto';
import { CreatePositionDto, UpdatePositionDto } from './dto/position.dto';
import { PublicationQueryDto } from './dto/publication-query.dto';
import {
  BulkReviewResearchDto,
  ReviewResearchDto,
  SubmitResearchDto,
  UpdateResearchDto,
  VerifyResearchSourceDto,
} from './dto/research.dto';
import { ResearchReviewQueryDto } from './dto/research-review-query.dto';
import { ResearchRelationshipsService } from './research-relationships.service';
import { ResearchService } from './research.service';

@Controller()
export class ResearchController {
  constructor(
    private readonly relationships: ResearchRelationshipsService,
    private readonly researchService: ResearchService,
  ) {}

  @Public()
  @Get('people')
  people() {
    return this.researchService.people();
  }

  @Public()
  @Get('people/:slug')
  personBySlug(@Param('slug') slug: string) {
    return this.researchService.personBySlug(slug);
  }

  @Public()
  @Get('research')
  research(@Query('type') type?: ResearchItemType) {
    return this.researchService.research(type);
  }

  @Public()
  @Get('publications')
  publications(@Query() query: PublicationQueryDto) {
    return this.researchService.publications(query);
  }

  @Get('research-connections/mine')
  myResearchConnections(@CurrentUser() user: AuthenticatedUser) {
    return this.relationships.mine(user);
  }

  @Get('research-connections/search')
  searchResearchConnections(@Query('query') query = '') {
    return this.relationships.search(query);
  }

  @Get('research-connections/people')
  @RequireRole(PlatformRole.MODERATOR)
  researchConnectionPeople(@Query('query') query = '') {
    return this.relationships.people(query);
  }

  @Post('research/:id/contributors/:sortOrder/claim')
  claimContributor(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sortOrder', ParseIntPipe) sortOrder: number,
    @Body() body: ClaimContributorDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.relationships.claim(id, sortOrder, body, user);
  }

  @Post('research/:id/contributors/:sortOrder/link')
  @RequireRole(PlatformRole.MODERATOR)
  linkContributor(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sortOrder', ParseIntPipe) sortOrder: number,
    @Body() body: LinkContributorDto,
    @CurrentUser() reviewer: AuthenticatedUser,
  ) {
    return this.relationships.link(id, sortOrder, body, reviewer);
  }

  @Post('contributor-matches/:id/review')
  @RequireRole(PlatformRole.MODERATOR)
  reviewContributorMatch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReviewContributorMatchDto,
    @CurrentUser() reviewer: AuthenticatedUser,
  ) {
    return this.relationships.review(id, body, reviewer);
  }

  @Post('research/:id/discover')
  @RequireRole(PlatformRole.MODERATOR)
  rediscoverResearch(@Param('id', ParseUUIDPipe) id: string) {
    return this.researchService.rediscover(id);
  }

  @Public()
  @Get('stats')
  stats() {
    return this.researchService.publicStats();
  }

  @Get('research/submitters')
  @RequireRole(PlatformRole.MODERATOR)
  submitters() {
    return this.researchService.submitters();
  }

  @Post('research/:id/verify-source')
  @RequireRole(PlatformRole.MODERATOR)
  verifySource(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: VerifyResearchSourceDto,
    @CurrentUser() reviewer: AuthenticatedUser,
  ) {
    return this.researchService.verifySource(id, body, reviewer);
  }

  @Public()
  @Get('research/:slug')
  researchBySlug(@Param('slug') slug: string) {
    return this.researchService.researchBySlug(slug);
  }

  @Post('research')
  submitResearch(
    @Body() body: SubmitResearchDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.researchService.submit(body, user);
  }

  @Patch('research/:id')
  @RequireRole(PlatformRole.MODERATOR)
  updateReviewRecord(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateResearchDto,
    @CurrentUser() reviewer: AuthenticatedUser,
  ) {
    return this.researchService.updateReviewRecord(id, body, reviewer);
  }

  @Get('research-review')
  @RequireRole(PlatformRole.MODERATOR)
  reviewQueue(@Query() query: ResearchReviewQueryDto) {
    return this.researchService.reviewQueue(query);
  }

  @Post('research-review/bulk-review')
  @RequireRole(PlatformRole.MODERATOR)
  bulkReviewResearch(
    @Body() body: BulkReviewResearchDto,
    @CurrentUser() reviewer: AuthenticatedUser,
  ) {
    return this.researchService.bulkReview(body, reviewer);
  }

  @Get('research-review/:id')
  @RequireRole(PlatformRole.MODERATOR)
  reviewItem(@Param('id', ParseUUIDPipe) id: string) {
    return this.researchService.reviewItem(id);
  }

  @Post('research/:id/review')
  @RequireRole(PlatformRole.MODERATOR)
  reviewResearch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReviewResearchDto,
    @CurrentUser() reviewer: AuthenticatedUser,
  ) {
    return this.researchService.review(id, body, reviewer);
  }

  @Public()
  @Get('positions')
  positions() {
    return this.researchService.positions();
  }

  @Get('positions/admin')
  @RequireRole(PlatformRole.MODERATOR)
  adminPositions() {
    return this.researchService.adminPositions();
  }

  @Get('positions/admin/:id')
  @RequireRole(PlatformRole.MODERATOR)
  adminPosition(@Param('id', ParseUUIDPipe) id: string) {
    return this.researchService.adminPosition(id);
  }

  @Post('positions')
  @RequireRole(PlatformRole.MODERATOR)
  createPosition(@Body() body: CreatePositionDto) {
    return this.researchService.createPosition(body);
  }

  @Patch('positions/:id')
  @RequireRole(PlatformRole.MODERATOR)
  updatePosition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdatePositionDto,
  ) {
    return this.researchService.updatePosition(id, body);
  }

  @Post('positions/:id/enable')
  @RequireRole(PlatformRole.MODERATOR)
  enablePosition(@Param('id', ParseUUIDPipe) id: string) {
    return this.researchService.enablePosition(id);
  }

  @Post('positions/:id/disable')
  @RequireRole(PlatformRole.MODERATOR)
  disablePosition(@Param('id', ParseUUIDPipe) id: string) {
    return this.researchService.disablePosition(id);
  }

  @Delete('positions/:id')
  @RequireRole(PlatformRole.MODERATOR)
  deletePosition(@Param('id', ParseUUIDPipe) id: string) {
    return this.researchService.deletePosition(id);
  }
}
