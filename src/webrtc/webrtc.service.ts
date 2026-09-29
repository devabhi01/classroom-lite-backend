import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Participant, ParticipantDocument } from '../classrooms/schemas/participant.schema.js';
import { ParticipantStatus } from '../common/constants/statuses.enum.js';

@Injectable()
export class WebrtcService {
  private readonly logger = new Logger(WebrtcService.name);

  constructor(
    @InjectModel(Participant.name)
    private readonly participantModel: Model<ParticipantDocument>,
  ) {}

  async validateSignalingPeers(
    classroomId: string,
    senderUserId: string,
    targetUserId: string,
  ): Promise<boolean> {
    if (senderUserId === targetUserId) {
      throw new ForbiddenException('Sender and target cannot be the same user');
    }

    const cId = new Types.ObjectId(classroomId);

    // Verify sender is accepted participant
    const sender = await this.participantModel.findOne({
      classroomId: cId,
      userId: new Types.ObjectId(senderUserId),
      status: ParticipantStatus.ACCEPTED,
    });

    if (!sender) {
      this.logger.warn(`Sender ${senderUserId} is not an accepted participant in classroom ${classroomId}`);
      return false;
    }

    // Verify target is accepted participant in the same classroom
    const target = await this.participantModel.findOne({
      classroomId: cId,
      userId: new Types.ObjectId(targetUserId),
      status: ParticipantStatus.ACCEPTED,
    });

    if (!target) {
      this.logger.warn(`Target ${targetUserId} is not an accepted participant in classroom ${classroomId}`);
      return false;
    }

    return true;
  }
}
