import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { ClassroomsService } from './classrooms.service.js';
import { CreateClassroomDto } from './dto/create-classroom.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface.js';

@ApiTags('Classrooms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ThrottlerGuard)
@Controller('classrooms')
export class ClassroomsController {
  constructor(private readonly classroomsService: ClassroomsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Create a new classroom (User becomes Host)' })
  @ApiResponse({
    status: 201,
    description: 'Classroom created successfully with unique 6-character code',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 400, description: 'Bad Request - Validation error' })
  async create(
    @Body() dto: CreateClassroomDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.classroomsService.createClassroom(dto, user);
  }

  // ==========================================
  // DASHBOARD HISTORY ENDPOINTS
  // Defined before /:code to avoid route collision
  // ==========================================

  @Get('history/teacher')
  @ApiOperation({
    summary: 'Teacher Dashboard: Get past classrooms history with who joined and attendance duration',
  })
  @ApiResponse({
    status: 200,
    description: 'Teacher classrooms history returned with participant details and durations',
  })
  async getTeacherHistory(@CurrentUser() user: AuthenticatedUser) {
    return this.classroomsService.getTeacherHistory(user.id);
  }

  @Get('history/student')
  @ApiOperation({
    summary: 'Student Dashboard: Get past attended classes with attendance duration and details',
  })
  @ApiResponse({
    status: 200,
    description: 'Student attended classrooms history returned with durations',
  })
  async getStudentHistory(@CurrentUser() user: AuthenticatedUser) {
    return this.classroomsService.getStudentHistory(user.id);
  }

  // ==========================================
  // CLASSROOM SPECIFIC ENDPOINTS
  // ==========================================

  @Get(':code')
  @ApiOperation({ summary: 'Get classroom details by code' })
  @ApiResponse({ status: 200, description: 'Classroom details retrieved' })
  @ApiResponse({ status: 404, description: 'Classroom not found' })
  async findOne(@Param('code') code: string) {
    return this.classroomsService.getClassroom(code);
  }

  @Get(':code/history')
  @ApiOperation({
    summary: 'Get detailed history and attendance report for a specific classroom',
  })
  @ApiResponse({
    status: 200,
    description: 'Detailed classroom session report with participants and time spent',
  })
  @ApiResponse({ status: 403, description: 'Forbidden - User not part of this class' })
  @ApiResponse({ status: 404, description: 'Classroom not found' })
  async getClassroomHistory(
    @Param('code') code: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.classroomsService.getClassroomHistory(code, user);
  }

  @Post(':code/join')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @ApiOperation({ summary: 'Submit a join request for a classroom (Student)' })
  @ApiResponse({ status: 200, description: 'Join request submitted' })
  @ApiResponse({ status: 404, description: 'Classroom not found' })
  @ApiResponse({ status: 409, description: 'Request already pending' })
  @ApiResponse({ status: 400, description: 'Classroom is not active or has ended' })
  async join(
    @Param('code') code: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.classroomsService.joinClassroom(code, user);
  }

  @Get(':code/participants')
  @ApiOperation({ summary: 'List accepted participants in a classroom' })
  @ApiResponse({ status: 200, description: 'List of accepted participants' })
  @ApiResponse({ status: 404, description: 'Classroom not found' })
  async getParticipants(@Param('code') code: string) {
    return this.classroomsService.getParticipants(code);
  }

  @Get(':code/requests')
  @ApiOperation({ summary: 'List pending join requests (Host only)' })
  @ApiResponse({ status: 200, description: 'List of pending student join requests' })
  @ApiResponse({ status: 403, description: 'Forbidden - Only host can view requests' })
  @ApiResponse({ status: 404, description: 'Classroom not found' })
  async getRequests(
    @Param('code') code: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.classroomsService.getRequests(code, user);
  }

  @Post(':code/requests/:userId/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept a student join request (Host only)' })
  @ApiResponse({ status: 200, description: 'Student join request accepted' })
  @ApiResponse({ status: 403, description: 'Forbidden - Only host can accept' })
  @ApiResponse({ status: 404, description: 'Classroom or request not found' })
  async acceptRequest(
    @Param('code') code: string,
    @Param('userId') userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.classroomsService.acceptRequest(code, userId, user);
  }

  @Post(':code/requests/:userId/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a student join request (Host only)' })
  @ApiResponse({ status: 200, description: 'Student join request rejected' })
  @ApiResponse({ status: 403, description: 'Forbidden - Only host can reject' })
  @ApiResponse({ status: 404, description: 'Classroom or request not found' })
  async rejectRequest(
    @Param('code') code: string,
    @Param('userId') userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.classroomsService.rejectRequest(code, userId, user);
  }

  @Post(':code/leave')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Leave a classroom (Participant)' })
  @ApiResponse({ status: 200, description: 'Left classroom successfully' })
  @ApiResponse({ status: 404, description: 'Participant record not found' })
  async leave(
    @Param('code') code: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.classroomsService.leaveClassroom(code, user);
  }

  @Post(':code/end')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End classroom session (Host only)' })
  @ApiResponse({ status: 200, description: 'Classroom ended successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Only host can end' })
  @ApiResponse({ status: 404, description: 'Classroom not found' })
  async end(
    @Param('code') code: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.classroomsService.endClassroom(code, user);
  }
}
