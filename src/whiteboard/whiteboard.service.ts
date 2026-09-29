import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  WhiteboardOperation,
  WhiteboardOperationDocument,
} from './schemas/whiteboard-operation.schema.js';
import { WhiteboardOperationType } from '../common/constants/statuses.enum.js';

@Injectable()
export class WhiteboardService {
  private readonly logger = new Logger(WhiteboardService.name);

  constructor(
    @InjectModel(WhiteboardOperation.name)
    private readonly operationModel: Model<WhiteboardOperationDocument>,
  ) {}

  async saveOperation(
    classroomId: string,
    userId: string,
    operation: {
      type: WhiteboardOperationType;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      color?: string;
      width: number;
    },
  ): Promise<WhiteboardOperationDocument> {
    const doc = new this.operationModel({
      classroomId: new Types.ObjectId(classroomId),
      userId: new Types.ObjectId(userId),
      type: operation.type,
      x1: operation.x1,
      y1: operation.y1,
      x2: operation.x2,
      y2: operation.y2,
      color: operation.color,
      width: operation.width,
    });
    return doc.save();
  }

  async getOperations(classroomId: string): Promise<WhiteboardOperation[]> {
    return this.operationModel
      .find({ classroomId: new Types.ObjectId(classroomId) })
      .sort({ createdAt: 1 })
      .exec();
  }

  async clearOperations(classroomId: string): Promise<number> {
    const result = await this.operationModel
      .deleteMany({ classroomId: new Types.ObjectId(classroomId) })
      .exec();
    this.logger.log(`Cleared ${result.deletedCount} whiteboard operations for classroom: ${classroomId}`);
    return result.deletedCount || 0;
  }
}
