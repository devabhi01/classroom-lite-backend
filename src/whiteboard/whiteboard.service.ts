import { Injectable, Logger } from '@nestjs/common';
import { WhiteboardOperationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class WhiteboardService {
  private readonly logger = new Logger(WhiteboardService.name);

  constructor(private readonly prisma: PrismaService) {}

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
  ) {
    return this.prisma.whiteboardOperation.create({
      data: {
        classroomId,
        userId,
        type: operation.type,
        x1: operation.x1,
        y1: operation.y1,
        x2: operation.x2,
        y2: operation.y2,
        color: operation.color || null,
        width: operation.width,
      },
    });
  }

  async getOperations(classroomId: string) {
    return this.prisma.whiteboardOperation.findMany({
      where: { classroomId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async clearOperations(classroomId: string): Promise<number> {
    const result = await this.prisma.whiteboardOperation.deleteMany({
      where: { classroomId },
    });
    this.logger.log(`Cleared ${result.count} whiteboard operations for classroom: ${classroomId}`);
    return result.count;
  }
}
