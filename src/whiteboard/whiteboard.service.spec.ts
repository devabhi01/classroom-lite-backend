import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhiteboardOperationType } from '@prisma/client';
import { WhiteboardService } from './whiteboard.service.js';

describe('WhiteboardService', () => {
  let service: WhiteboardService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      whiteboardOperation: {
        create: vi.fn(),
        findMany: vi.fn(),
        deleteMany: vi.fn(),
      },
    };
    service = new WhiteboardService(mockPrisma);
  });

  it('should save a draw operation to PostgreSQL via Prisma', async () => {
    const classroomId = 'classroom-uuid-1';
    const userId = 'user-uuid-1';

    mockPrisma.whiteboardOperation.create.mockResolvedValue({
      id: 'op-1',
      classroomId,
      userId,
      type: WhiteboardOperationType.DRAW,
      x1: 10,
      y1: 20,
      x2: 30,
      y2: 40,
      color: '#FF0000',
      width: 4,
      createdAt: new Date(),
    });

    const op = await service.saveOperation(classroomId, userId, {
      type: WhiteboardOperationType.DRAW,
      x1: 10,
      y1: 20,
      x2: 30,
      y2: 40,
      color: '#FF0000',
      width: 4,
    });

    expect(op).toBeDefined();
    expect(op.type).toBe(WhiteboardOperationType.DRAW);
    expect(op.x1).toBe(10);
    expect(op.color).toBe('#FF0000');
    expect(mockPrisma.whiteboardOperation.create).toHaveBeenCalled();
  });

  it('should save an erase operation to PostgreSQL via Prisma', async () => {
    const classroomId = 'classroom-uuid-1';
    const userId = 'user-uuid-1';

    mockPrisma.whiteboardOperation.create.mockResolvedValue({
      id: 'op-2',
      classroomId,
      userId,
      type: WhiteboardOperationType.ERASE,
      x1: 50,
      y1: 50,
      x2: 60,
      y2: 60,
      width: 25,
      createdAt: new Date(),
    });

    const op = await service.saveOperation(classroomId, userId, {
      type: WhiteboardOperationType.ERASE,
      x1: 50,
      y1: 50,
      x2: 60,
      y2: 60,
      width: 25,
    });

    expect(op).toBeDefined();
    expect(op.type).toBe(WhiteboardOperationType.ERASE);
    expect(op.width).toBe(25);
  });

  it('should retrieve operations ordered chronologically', async () => {
    const classroomId = 'classroom-uuid-1';
    const mockOps = [
      { id: 'op-1', type: WhiteboardOperationType.DRAW, x1: 0, y1: 0, x2: 10, y2: 10 },
      { id: 'op-2', type: WhiteboardOperationType.ERASE, x1: 5, y1: 5, x2: 15, y2: 15 },
    ];

    mockPrisma.whiteboardOperation.findMany.mockResolvedValue(mockOps);

    const result = await service.getOperations(classroomId);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe(WhiteboardOperationType.DRAW);
    expect(mockPrisma.whiteboardOperation.findMany).toHaveBeenCalledWith({
      where: { classroomId },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('should clear all operations for a given classroom', async () => {
    const classroomId = 'classroom-uuid-1';
    mockPrisma.whiteboardOperation.deleteMany.mockResolvedValue({ count: 15 });

    const deleted = await service.clearOperations(classroomId);
    expect(deleted).toBe(15);
    expect(mockPrisma.whiteboardOperation.deleteMany).toHaveBeenCalledWith({
      where: { classroomId },
    });
  });
});
