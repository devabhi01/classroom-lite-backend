import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Root')
@Controller()
export class AppController {
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'API root health check' })
  @ApiResponse({
    status: 200,
    description: 'API is running',
    schema: {
      example: {
        success: true,
        status: 'ok',
        service: 'TDP Classroom Lite Backend API',
        version: '1.0.0',
        docs: '/api/docs',
        health: '/health',
      },
    },
  })
  getRoot() {
    return {
      success: true,
      status: 'ok',
      service: 'TDP Classroom Lite Backend API',
      version: '1.0.0',
      docs: '/api/docs',
      health: '/health',
    };
  }
}
