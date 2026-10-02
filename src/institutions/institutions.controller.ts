import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { InstitutionsService } from './institutions.service.js';
import { CreateInstitutionDto } from './dto/create-institution.dto.js';
import { UpdateInstitutionDto } from './dto/update-institution.dto.js';
import { JoinByCodeDto } from './dto/join-by-code.dto.js';
import { SetAdminRoleDto } from './dto/set-admin-role.dto.js';
import { TransferOwnershipDto } from './dto/transfer-ownership.dto.js';
import {
  InstitutionRoleQueryDto,
  InstitutionSearchQueryDto,
} from './dto/institution-query.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface.js';

@ApiTags('Institutions')
@Controller('institutions')
export class InstitutionsController {
  constructor(private readonly institutionsService: InstitutionsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Create a new institution (Teacher only)' })
  @ApiResponse({ status: 201, description: 'Institution created successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Only teachers can create an institution' })
  async create(
    @Body() dto: CreateInstitutionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.institutionsService.create(user.id, dto);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search institutions (Public info: id, name, code, logo)' })
  @ApiResponse({ status: 200, description: 'Matching institutions returned' })
  async search(@Query() query: InstitutionSearchQueryDto) {
    return this.institutionsService.search(query.q);
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all accepted institutions of the current user' })
  @ApiResponse({ status: 200, description: 'User institutions returned' })
  async getMyInstitutions(@CurrentUser() user: AuthenticatedUser) {
    return this.institutionsService.getMyInstitutions(user.id);
  }

  @Post('join-by-code')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Join an institution using its unique uppercase code' })
  @ApiResponse({ status: 200, description: 'Join request submitted' })
  @ApiResponse({ status: 404, description: 'Institution not found' })
  async joinByCode(
    @Body() dto: JoinByCodeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.institutionsService.joinByCode(dto.code, user);
  }

  @Get(':id/stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get institution statistics (Teachers, Students, Total members)' })
  @ApiResponse({ status: 200, description: 'Statistics returned' })
  async getStats(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.institutionsService.getStats(id, user);
  }

  @Get(':id/requests')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'View pending join requests (Owner or Admin only)' })
  @ApiResponse({ status: 200, description: 'Pending requests returned' })
  @ApiResponse({ status: 403, description: 'Forbidden - Only owner or admin can view requests' })
  async getRequests(
    @Param('id') id: string,
    @Query() query: InstitutionRoleQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.institutionsService.getRequests(id, user, query.role);
  }

  @Get(':id/members')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'View accepted members of institution (Authorized members only)' })
  @ApiResponse({ status: 200, description: 'Members returned' })
  async getMembers(
    @Param('id') id: string,
    @Query() query: InstitutionRoleQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.institutionsService.getMembers(id, user, query.role);
  }

  @Get(':id/classrooms')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get classrooms for an institution' })
  @ApiResponse({ status: 200, description: 'List of classrooms in this institution' })
  async getClassrooms(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.institutionsService.getClassrooms(id, user);
  }

  @Post(':id/requests/:userId/accept')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept member join request (Owner or Admin only)' })
  @ApiResponse({ status: 200, description: 'Request accepted' })
  async acceptRequest(
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.institutionsService.acceptRequest(id, targetUserId, user);
  }

  @Post(':id/requests/:userId/reject')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject member join request (Owner or Admin only)' })
  @ApiResponse({ status: 200, description: 'Request rejected' })
  async rejectRequest(
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.institutionsService.rejectRequest(id, targetUserId, user);
  }

  @Delete(':id/members/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a member from institution (Owner or Admin only)' })
  @ApiResponse({ status: 200, description: 'Member removed' })
  async removeMember(
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.institutionsService.removeMember(id, targetUserId, user);
  }

  @Post(':id/leave')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Leave an institution (Owner cannot leave)' })
  @ApiResponse({ status: 200, description: 'Successfully left institution' })
  async leave(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.institutionsService.leave(id, user);
  }

  @Post(':id/join')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit join request to institution by ID' })
  @ApiResponse({ status: 200, description: 'Join request submitted' })
  async joinById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.institutionsService.joinById(id, user);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get institution details (Authorized members/owner only)' })
  @ApiResponse({ status: 200, description: 'Institution details returned' })
  async getById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.institutionsService.getById(id, user);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update institution details (Owner or Admin only)' })
  @ApiResponse({ status: 200, description: 'Institution updated' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateInstitutionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.institutionsService.update(id, dto, user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete institution (Owner only)' })
  @ApiResponse({ status: 200, description: 'Institution deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Only the institution owner can delete this institution' })
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.institutionsService.delete(id, user);
  }

  @Patch(':id/members/:userId/admin')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Appoint or remove Admin role for a teacher (Owner only)' })
  @ApiResponse({ status: 200, description: 'Admin status updated' })
  @ApiResponse({ status: 400, description: 'Only teachers can be appointed as admin' })
  @ApiResponse({ status: 403, description: 'Forbidden - Only the institution owner can change admin roles' })
  async setAdminRole(
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @Body() dto: SetAdminRoleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.institutionsService.setAdminRole(id, targetUserId, dto.isAdmin, user);
  }

  @Post(':id/transfer-ownership')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transfer institution ownership to another teacher (Owner only)' })
  @ApiResponse({ status: 200, description: 'Ownership transferred successfully' })
  @ApiResponse({ status: 400, description: 'Target user must be a teacher member' })
  @ApiResponse({ status: 403, description: 'Forbidden - Only the institution owner can transfer ownership' })
  async transferOwnership(
    @Param('id') id: string,
    @Body() dto: TransferOwnershipDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.institutionsService.transferOwnership(id, dto.newOwnerId, user);
  }
}
