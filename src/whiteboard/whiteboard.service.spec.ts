import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { WhiteboardService } from './whiteboard.service.js';
import { WhiteboardOperationType } from '../common/constants/statuses.enum.js';

describe('WhiteboardService', () => {
  let service: WhiteboardService;
  let mockOperationModel: any;

  beforeEach(() => {
    function MockOperation(data: any) {
      Object.assign(this, data);
      this._id = new Types.ObjectId();
      this.createdAt = new Date();
      this.save = vi.fn().mockResolvedValue(this);
    }
    MockOperation.find = vi.fn();
    MockOperation.deleteMany = vi.fn();
    mockOperationModel = MockOperation;

    service = new WhiteboardService(mockOperationModel as any);
  });

  it('should save a draw operation to MongoDB', async () => {
    const classroomId = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();

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
  });

  it('should save an erase operation to MongoDB', async () => {
    const classroomId = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();

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
    const classroomId = new Types.ObjectId().toString();
    const mockOps = [
      { _id: new Types.ObjectId(), type: 'DRAW', x1: 0, y1: 0, x2: 10, y2: 10 },
      { _id: new Types.ObjectId(), type: 'ERASE', x1: 5, y1: 5, x2: 15, y2: 15 },
    ];

    mockOperationModel.find.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockOps),
      }),
    });

    const result = await service.getOperations(classroomId);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('DRAW');
  });

  it('should clear all operations for a given classroom', async () => {
    const classroomId = new Types.ObjectId().toString();
    mockOperationModel.deleteMany.mockReturnValue({
      exec: vi.fn().mockResolvedValue({ deletedCount: 15 }),
    });

    const deleted = await service.clearOperations(classroomId);
    expect(deleted).toBe(15);
  });
});
