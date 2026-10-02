import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  let controller: HealthController;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    controller = new HealthController(mockPrisma);
  });

  it('should return connected database status when PostgreSQL query succeeds', async () => {
    const result = await controller.check();
    expect(result.success).toBe(true);
    expect(result.status).toBe('ok');
    expect(result.service).toBe('tdp-classroom-lite-backend');
    expect(result.database).toBe('connected');
    expect(result.timestamp).toBeDefined();
  });

  it('should return disconnected database status when PostgreSQL query fails', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('Connection failed'));
    const result = await controller.check();
    expect(result.database).toBe('disconnected');
  });

  it('should handle undefined prisma gracefully and return disconnected', async () => {
    const noConnController = new HealthController(undefined);
    const result = await noConnController.check();
    expect(result.success).toBe(true);
    expect(result.database).toBe('disconnected');
  });
});
