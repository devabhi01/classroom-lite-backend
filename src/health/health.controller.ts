import { Controller, Get, Optional } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    @Optional()
    @InjectConnection()
    private readonly connection?: Connection,
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
  check() {
    const isDbConnected = Boolean(this.connection && this.connection.readyState === 1);

    return {
      success: true,
      status: 'ok',
      service: 'tdp-classroom-lite-backend',
      database: isDbConnected ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    };
  }
}
