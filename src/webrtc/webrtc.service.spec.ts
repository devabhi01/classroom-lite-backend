import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { ParticipantStatus } from '@prisma/client';
import { WebrtcService } from './webrtc.service.js';

describe('WebrtcService', () => {
  let service: WebrtcService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      classroomParticipant: {
        findUnique: vi.fn(),
      },
    };
    service = new WebrtcService(mockPrisma);
  });

  it('should validate successfully when both sender and target are accepted participants', async () => {
    const classroomId = 'classroom-uuid-1';
    const senderUserId = 'sender-uuid-1';
    const targetUserId = 'target-uuid-2';

    mockPrisma.classroomParticipant.findUnique
      .mockResolvedValueOnce({ userId: senderUserId, status: ParticipantStatus.ACCEPTED })
      .mockResolvedValueOnce({ userId: targetUserId, status: ParticipantStatus.ACCEPTED });

    const isValid = await service.validateSignalingPeers(classroomId, senderUserId, targetUserId);
    expect(isValid).toBe(true);
  });

  it('should reject when sender and target are the same user', async () => {
    const classroomId = 'classroom-uuid-1';
    const userId = 'user-uuid-1';

    await expect(service.validateSignalingPeers(classroomId, userId, userId)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should return false if target user is not in the classroom', async () => {
    const classroomId = 'classroom-uuid-1';
    const senderUserId = 'sender-uuid-1';
    const targetUserId = 'target-uuid-2';

    mockPrisma.classroomParticipant.findUnique
      .mockResolvedValueOnce({ userId: senderUserId, status: ParticipantStatus.ACCEPTED })
      .mockResolvedValueOnce(null);

    const isValid = await service.validateSignalingPeers(classroomId, senderUserId, targetUserId);
    expect(isValid).toBe(false);
  });
});
