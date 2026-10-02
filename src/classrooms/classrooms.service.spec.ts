import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import {
  ClassroomStatus,
  ClassroomType,
  InstitutionRole,
  MembershipStatus,
  ParticipantRole,
  ParticipantStatus,
} from '@prisma/client';
import { ClassroomsService } from './classrooms.service.js';

describe('ClassroomsService', () => {
  let service: ClassroomsService;
  let mockPrisma: any;
  let mockCodeGenerator: any;
  let mockUsersService: any;
  let mockClassroomGateway: any;

  const hostUser = {
    id: 'host-uuid-1',
    email: 'host@example.com',
    name: 'Host Teacher',
  };

  const studentUser = {
    id: 'student-uuid-1',
    email: 'student@example.com',
    name: 'Student One',
  };

  beforeEach(() => {
    mockPrisma = {
      classroom: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      classroomParticipant: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      institutionMembership: {
        findUnique: vi.fn(),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => {
        return callback(mockPrisma);
      }),
    };

    mockCodeGenerator = {
      generateUniqueCode: vi.fn().mockResolvedValue('TDP8K2'),
    };

    mockUsersService = {
      findById: vi.fn().mockResolvedValue(hostUser),
    };

    mockClassroomGateway = {
      notifyHostNewRequest: vi.fn(),
      notifyStudentAccepted: vi.fn(),
      notifyStudentRejected: vi.fn(),
      broadcastToClassroom: vi.fn(),
      scheduleInitialInactivityTimer: vi.fn(),
    };

    service = new ClassroomsService(
      mockPrisma,
      mockCodeGenerator,
      mockUsersService,
      mockClassroomGateway,
    );
  });

  describe('createClassroom', () => {
    it('should create an independent classroom and register host as accepted participant', async () => {
      mockPrisma.classroom.create.mockResolvedValue({
        id: 'classroom-uuid-1',
        name: 'Java Programming',
        code: 'TDP8K2',
        hostId: hostUser.id,
        type: ClassroomType.INDEPENDENT,
        status: ClassroomStatus.ACTIVE,
      });

      mockPrisma.classroomParticipant.create.mockResolvedValue({
        id: 'part-uuid-1',
        classroomId: 'classroom-uuid-1',
        userId: hostUser.id,
        role: ParticipantRole.HOST,
        status: ParticipantStatus.ACCEPTED,
      });

      const result = await service.createClassroom({ name: 'Java Programming' }, hostUser);

      expect(result.success).toBe(true);
      expect(result.data.name).toBe('Java Programming');
      expect(result.data.code).toBe('TDP8K2');
      expect(result.data.status).toBe(ClassroomStatus.ACTIVE);
      expect(mockCodeGenerator.generateUniqueCode).toHaveBeenCalled();
    });

    it('should create an institution classroom if teacher has accepted membership', async () => {
      mockPrisma.institutionMembership.findUnique.mockResolvedValue({
        id: 'mem-1',
        institutionId: 'inst-1',
        userId: hostUser.id,
        role: InstitutionRole.TEACHER,
        status: MembershipStatus.ACCEPTED,
      });

      mockPrisma.classroom.create.mockResolvedValue({
        id: 'classroom-uuid-2',
        name: 'Java Advanced',
        code: 'TDP8K2',
        hostId: hostUser.id,
        type: ClassroomType.INSTITUTION,
        institutionId: 'inst-1',
        status: ClassroomStatus.ACTIVE,
      });

      mockPrisma.classroomParticipant.create.mockResolvedValue({
        id: 'part-uuid-2',
        classroomId: 'classroom-uuid-2',
        userId: hostUser.id,
        role: ParticipantRole.HOST,
        status: ParticipantStatus.ACCEPTED,
      });

      const result = await service.createClassroom(
        { name: 'Java Advanced', type: ClassroomType.INSTITUTION, institutionId: 'inst-1' },
        hostUser,
      );

      expect(result.success).toBe(true);
      expect(result.data.type).toBe(ClassroomType.INSTITUTION);
    });

    it('should reject institution classroom creation if teacher is not member of institution', async () => {
      mockPrisma.institutionMembership.findUnique.mockResolvedValue(null);

      await expect(
        service.createClassroom(
          { name: 'Java Advanced', type: ClassroomType.INSTITUTION, institutionId: 'inst-1' },
          hostUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getClassroom', () => {
    it('should return classroom details for valid code', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValue({
        id: 'classroom-uuid-1',
        name: 'Java Programming',
        code: 'TDP8K2',
        hostId: hostUser.id,
        status: ClassroomStatus.ACTIVE,
        type: ClassroomType.INDEPENDENT,
        institution: null,
        activePdfFileName: null,
        createdAt: new Date(),
      });

      const result = await service.getClassroom('TDP8K2');
      expect(result.success).toBe(true);
      expect(result.data.code).toBe('TDP8K2');
      expect(result.data.host.name).toBe('Host Teacher');
    });

    it('should throw NotFoundException if classroom code does not exist', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValue(null);

      await expect(service.getClassroom('NOTFND')).rejects.toThrow(NotFoundException);
    });
  });

  describe('joinClassroom', () => {
    it('should create a join request with REQUESTED status and notify host', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValue({
        id: 'classroom-uuid-1',
        code: 'TDP8K2',
        hostId: hostUser.id,
        type: ClassroomType.INDEPENDENT,
        status: ClassroomStatus.ACTIVE,
      });
      mockPrisma.classroomParticipant.findUnique.mockResolvedValue(null);
      mockPrisma.classroomParticipant.create.mockResolvedValue({
        id: 'part-uuid-3',
        classroomId: 'classroom-uuid-1',
        userId: studentUser.id,
        role: ParticipantRole.STUDENT,
        status: ParticipantStatus.REQUESTED,
        createdAt: new Date(),
      });

      const result = await service.joinClassroom('TDP8K2', studentUser);
      expect(result.success).toBe(true);
      expect(result.status).toBe(ParticipantStatus.REQUESTED);
      expect(mockClassroomGateway.notifyHostNewRequest).toHaveBeenCalled();
    });

    it('should reject joining an institution classroom if student is not accepted member of institution', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValue({
        id: 'classroom-uuid-1',
        code: 'TDP8K2',
        hostId: hostUser.id,
        type: ClassroomType.INSTITUTION,
        institutionId: 'inst-1',
        status: ClassroomStatus.ACTIVE,
      });

      mockPrisma.institutionMembership.findUnique.mockResolvedValue(null);

      await expect(service.joinClassroom('TDP8K2', studentUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ConflictException on duplicate pending join request', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValue({
        id: 'classroom-uuid-1',
        code: 'TDP8K2',
        hostId: hostUser.id,
        type: ClassroomType.INDEPENDENT,
        status: ClassroomStatus.ACTIVE,
      });
      mockPrisma.classroomParticipant.findUnique.mockResolvedValue({
        status: ParticipantStatus.REQUESTED,
      });

      await expect(service.joinClassroom('TDP8K2', studentUser)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw BadRequestException when trying to join ended classroom', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValue({
        id: 'classroom-uuid-1',
        code: 'TDP8K2',
        hostId: hostUser.id,
        status: ClassroomStatus.ENDED,
      });

      await expect(service.joinClassroom('TDP8K2', studentUser)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('acceptRequest & rejectRequest', () => {
    it('should allow host to accept pending student request', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValue({
        id: 'classroom-uuid-1',
        code: 'TDP8K2',
        hostId: hostUser.id,
      });

      mockPrisma.classroomParticipant.findUnique.mockResolvedValue({
        id: 'part-uuid-1',
        classroomId: 'classroom-uuid-1',
        userId: studentUser.id,
        status: ParticipantStatus.REQUESTED,
        role: ParticipantRole.STUDENT,
      });

      mockPrisma.classroomParticipant.update.mockResolvedValue({
        id: 'part-uuid-1',
        status: ParticipantStatus.ACCEPTED,
        joinedAt: new Date(),
      });

      mockUsersService.findById.mockResolvedValue(studentUser);

      const result = await service.acceptRequest('TDP8K2', studentUser.id, hostUser);
      expect(result.success).toBe(true);
      expect(mockClassroomGateway.notifyStudentAccepted).toHaveBeenCalled();
      expect(mockClassroomGateway.broadcastToClassroom).toHaveBeenCalledWith(
        'TDP8K2',
        'classroom:participant-updated',
        expect.any(Object),
      );
    });

    it('should reject non-host attempting to accept request with ForbiddenException', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValue({
        id: 'classroom-uuid-1',
        code: 'TDP8K2',
        hostId: hostUser.id,
      });

      await expect(
        service.acceptRequest('TDP8K2', 'someone-else', studentUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow host to reject pending student request', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValue({
        id: 'classroom-uuid-1',
        code: 'TDP8K2',
        hostId: hostUser.id,
      });

      mockPrisma.classroomParticipant.findUnique.mockResolvedValue({
        id: 'part-uuid-1',
        status: ParticipantStatus.REQUESTED,
      });

      const result = await service.rejectRequest('TDP8K2', studentUser.id, hostUser);
      expect(result.success).toBe(true);
      expect(mockClassroomGateway.notifyStudentRejected).toHaveBeenCalled();
    });
  });

  describe('leaveClassroom & endClassroom', () => {
    it('should update status to LEFT and broadcast classroom:user-left', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValue({
        id: 'classroom-uuid-1',
        code: 'TDP8K2',
      });

      mockPrisma.classroomParticipant.findUnique.mockResolvedValue({
        id: 'part-uuid-1',
        status: ParticipantStatus.ACCEPTED,
        joinedAt: new Date(Date.now() - 60000),
      });

      mockPrisma.classroomParticipant.update.mockResolvedValue({
        id: 'part-uuid-1',
        status: ParticipantStatus.LEFT,
        durationSeconds: 60,
      });

      const result = await service.leaveClassroom('TDP8K2', studentUser);
      expect(result.success).toBe(true);
      expect(mockClassroomGateway.broadcastToClassroom).toHaveBeenCalledWith(
        'TDP8K2',
        'classroom:user-left',
        expect.any(Object),
      );
    });

    it('should allow host to end classroom session', async () => {
      mockPrisma.classroom.findUnique.mockResolvedValue({
        id: 'classroom-uuid-1',
        code: 'TDP8K2',
        hostId: hostUser.id,
        status: ClassroomStatus.ACTIVE,
      });

      mockPrisma.classroom.update.mockResolvedValue({
        id: 'classroom-uuid-1',
        status: ClassroomStatus.ENDED,
      });

      mockPrisma.classroomParticipant.findMany.mockResolvedValue([]);

      const result = await service.endClassroom('TDP8K2', hostUser);
      expect(result.success).toBe(true);
      expect(mockClassroomGateway.broadcastToClassroom).toHaveBeenCalledWith(
        'TDP8K2',
        'classroom:ended',
        expect.any(Object),
      );
    });
  });
});
