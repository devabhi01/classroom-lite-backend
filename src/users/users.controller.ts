import { Controller, Get, Delete, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface.js';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get profile of currently authenticated user' })
  @ApiResponse({
    status: 200,
    description: 'Current user profile returned successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    const fullUser = await this.usersService.findById(user.id);
    return {
      success: true,
      data: this.usersService.sanitizeUser(fullUser || user),
    };
  }

  @Delete('me')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Permanently delete currently authenticated user account' })
  @ApiResponse({
    status: 200,
    description: 'User account deleted successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot delete account while owning institutions',
  })
  async deleteAccount(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.deleteAccount(user.id);
  }
}
