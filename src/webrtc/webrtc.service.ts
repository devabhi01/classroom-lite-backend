import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { ParticipantStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class WebrtcService {
  private readonly logger = new Logger(WebrtcService.name);

  constructor(private readonly prisma: PrismaService) {}

  async validateSignalingPeers(
    classroomId: string,
    senderUserId: string,
    targetUserId: string,
  ): Promise<boolean> {
    if (senderUserId === targetUserId) {
      throw new ForbiddenException('Sender and target cannot be the same user');
    }

    // Verify sender is accepted participant
    const sender = await this.prisma.classroomParticipant.findUnique({
      where: {
        classroomId_userId: {
          classroomId,
          userId: senderUserId,
        },
      },
    });

    if (!sender || sender.status !== ParticipantStatus.ACCEPTED) {
      this.logger.warn(`Sender ${senderUserId} is not an accepted participant in classroom ${classroomId}`);
      return false;
    }

    // Verify target is accepted participant in the same classroom
    const target = await this.prisma.classroomParticipant.findUnique({
      where: {
        classroomId_userId: {
          classroomId,
          userId: targetUserId,
        },
      },
    });

    if (!target || target.status !== ParticipantStatus.ACCEPTED) {
      this.logger.warn(`Target ${targetUserId} is not an accepted participant in classroom ${classroomId}`);
      return false;
    }

    return true;
  }
}
