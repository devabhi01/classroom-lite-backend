import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  let controller: HealthController;
  let mockConnection: any;

  beforeEach(() => {
    mockConnection = {
      readyState: 1,
    };
    controller = new HealthController(mockConnection);
  });

  it('should return connected database status when readyState is 1', () => {
    mockConnection.readyState = 1;
    const result = controller.check();
    expect(result.success).toBe(true);
    expect(result.status).toBe('ok');
    expect(result.service).toBe('tdp-classroom-lite-backend');
    expect(result.database).toBe('connected');
    expect(result.timestamp).toBeDefined();
  });

  it('should return disconnected database status when readyState is not 1', () => {
    mockConnection.readyState = 0;
    const result = controller.check();
    expect(result.database).toBe('disconnected');
  });

  it('should handle undefined connection gracefully and return disconnected', () => {
    const noConnController = new HealthController(undefined);
    const result = noConnController.check();
    expect(result.success).toBe(true);
    expect(result.database).toBe('disconnected');
  });
});
