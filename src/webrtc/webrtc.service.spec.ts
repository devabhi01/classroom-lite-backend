import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { WebrtcService } from './webrtc.service.js';
import { ParticipantStatus } from '../common/constants/statuses.enum.js';

describe('WebrtcService', () => {
  let service: WebrtcService;
  let mockParticipantModel: any;

  beforeEach(() => {
    mockParticipantModel = {
      findOne: vi.fn(),
    };
    service = new WebrtcService(mockParticipantModel);
  });

  it('should validate successfully when both sender and target are accepted participants', async () => {
    const classroomId = new Types.ObjectId().toString();
    const senderUserId = new Types.ObjectId().toString();
    const targetUserId = new Types.ObjectId().toString();

    // First call for sender, second call for target
    mockParticipantModel.findOne
      .mockResolvedValueOnce({ userId: senderUserId, status: ParticipantStatus.ACCEPTED })
      .mockResolvedValueOnce({ userId: targetUserId, status: ParticipantStatus.ACCEPTED });

    const isValid = await service.validateSignalingPeers(classroomId, senderUserId, targetUserId);
    expect(isValid).toBe(true);
  });

  it('should reject when sender and target are the same user', async () => {
    const classroomId = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();

    await expect(service.validateSignalingPeers(classroomId, userId, userId)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should return false if target user is not in the classroom', async () => {
    const classroomId = new Types.ObjectId().toString();
    const senderUserId = new Types.ObjectId().toString();
    const targetUserId = new Types.ObjectId().toString();

    mockParticipantModel.findOne
      .mockResolvedValueOnce({ userId: senderUserId, status: ParticipantStatus.ACCEPTED })
      .mockResolvedValueOnce(null);

    const isValid = await service.validateSignalingPeers(classroomId, senderUserId, targetUserId);
    expect(isValid).toBe(false);
  });
});
