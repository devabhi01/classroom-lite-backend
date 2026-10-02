import { Controller, Get, Optional } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service.js';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    @Optional()
    private readonly prisma?: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'System health check and database connectivity status' })
  @ApiResponse({
    status: 200,
    description: 'System health check status returned successfully',
    schema: {
      example: {
        success: true,
        status: 'ok',
        service: 'tdp-classroom-lite-backend',
        database: 'connected',
        timestamp: '2026-09-29T14:48:00.000Z',
      },
    },
  })
  async check() {
    let isDbConnected = false;
    if (this.prisma) {
      try {
        await this.prisma.$queryRaw`SELECT 1`;
        isDbConnected = true;
      } catch {
        isDbConnected = false;
      }
    }

    return {
      success: true,
      status: 'ok',
      service: 'tdp-classroom-lite-backend',
      database: isDbConnected ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    };
  }
}
