import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ClassroomsService } from './classrooms.service.js';
import { ClassroomStatus, ParticipantStatus } from '../common/constants/statuses.enum.js';
import { ParticipantRole } from '../common/constants/roles.enum.js';

describe('ClassroomsService', () => {
  let service: ClassroomsService;
  let mockClassroomModel: any;
  let mockParticipantModel: any;
  let mockCodeGenerator: any;
  let mockUsersService: any;
  let mockClassroomGateway: any;

  const hostUser = {
    id: new Types.ObjectId().toString(),
    email: 'host@example.com',
    name: 'Host Teacher',
  };

  const studentUser = {
    id: new Types.ObjectId().toString(),
    email: 'student@example.com',
    name: 'Student One',
  };

  beforeEach(() => {
    function MockClassroom(data: any) {
      Object.assign(this, data);
      this._id = new Types.ObjectId();
      this.createdAt = new Date();
      this.updatedAt = new Date();
      this.save = vi.fn().mockResolvedValue(this);
    }
    MockClassroom.findOne = vi.fn();
    MockClassroom.findById = vi.fn();
    MockClassroom.find = vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
      }),
    });
    mockClassroomModel = MockClassroom as any;

    function MockParticipant(data: any) {
      Object.assign(this, data);
      this._id = new Types.ObjectId();
      this.createdAt = new Date();
      this.updatedAt = new Date();
      this.save = vi.fn().mockResolvedValue(this);
    }
    MockParticipant.findOne = vi.fn();
    MockParticipant.find = vi.fn().mockResolvedValue([]);
    MockParticipant.countDocuments = vi.fn().mockResolvedValue(1);
    mockParticipantModel = MockParticipant as any;

    mockCodeGenerator = {
      generateUniqueCode: vi.fn().mockResolvedValue('TDP8K2'),
    };

    mockUsersService = {
      findById: vi.fn().mockResolvedValue({
        _id: hostUser.id,
        name: hostUser.name,
        email: hostUser.email,
      }),
    };

    mockClassroomGateway = {
      notifyHostNewRequest: vi.fn(),
      notifyStudentAccepted: vi.fn(),
      notifyStudentRejected: vi.fn(),
      broadcastToClassroom: vi.fn(),
      scheduleInitialInactivityTimer: vi.fn(),
      clearAllClassroomTimers: vi.fn(),
    };

    service = new ClassroomsService(
      mockClassroomModel,
      mockParticipantModel,
      mockCodeGenerator,
      mockUsersService,
      mockClassroomGateway,
    );
  });

  describe('createClassroom', () => {
    it('should create classroom and register host as accepted participant', async () => {
      const result = await service.createClassroom({ name: 'Java Programming' }, hostUser);

      expect(result.success).toBe(true);
      expect(result.data.name).toBe('Java Programming');
      expect(result.data.code).toBe('TDP8K2');
      expect(result.data.status).toBe(ClassroomStatus.ACTIVE);
      expect(mockCodeGenerator.generateUniqueCode).toHaveBeenCalled();
    });
  });

  describe('getClassroom', () => {
    it('should return classroom details for valid code', async () => {
      const mockClassroomId = new Types.ObjectId();
      mockClassroomModel.findOne.mockResolvedValue({
        _id: mockClassroomId,
        name: 'Java Programming',
        code: 'TDP8K2',
        hostId: new Types.ObjectId(hostUser.id),
        status: ClassroomStatus.ACTIVE,
        activePdf: null,
        createdAt: new Date(),
      });

      const result = await service.getClassroom('TDP8K2');
      expect(result.success).toBe(true);
      expect(result.data.code).toBe('TDP8K2');
      expect(result.data.host.name).toBe('Host Teacher');
    });

    it('should throw NotFoundException if classroom code does not exist', async () => {
      mockClassroomModel.findOne.mockResolvedValue(null);

      await expect(service.getClassroom('NOTFND')).rejects.toThrow(NotFoundException);
    });
  });

  describe('joinClassroom', () => {
    it('should create a join request with REQUESTED status and notify host', async () => {
      const classroomId = new Types.ObjectId();
      mockClassroomModel.findOne.mockResolvedValue({
        _id: classroomId,
        code: 'TDP8K2',
        hostId: new Types.ObjectId(hostUser.id),
        status: ClassroomStatus.ACTIVE,
      });
      mockParticipantModel.findOne.mockResolvedValue(null);

      const result = await service.joinClassroom('TDP8K2', studentUser);
      expect(result.success).toBe(true);
      expect(result.status).toBe(ParticipantStatus.REQUESTED);
      expect(mockClassroomGateway.notifyHostNewRequest).toHaveBeenCalled();
    });

    it('should throw ConflictException on duplicate pending join request', async () => {
      const classroomId = new Types.ObjectId();
      mockClassroomModel.findOne.mockResolvedValue({
        _id: classroomId,
        code: 'TDP8K2',
        hostId: new Types.ObjectId(hostUser.id),
        status: ClassroomStatus.ACTIVE,
      });
      mockParticipantModel.findOne.mockResolvedValue({
        status: ParticipantStatus.REQUESTED,
      });

      await expect(service.joinClassroom('TDP8K2', studentUser)).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException when trying to join ended classroom', async () => {
      mockClassroomModel.findOne.mockResolvedValue({
        _id: new Types.ObjectId(),
        code: 'TDP8K2',
        hostId: new Types.ObjectId(hostUser.id),
        status: ClassroomStatus.ENDED,
      });

      await expect(service.joinClassroom('TDP8K2', studentUser)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('acceptRequest & rejectRequest', () => {
    it('should allow host to accept pending student request', async () => {
      const classroomId = new Types.ObjectId();
      mockClassroomModel.findOne.mockResolvedValue({
        _id: classroomId,
        code: 'TDP8K2',
        hostId: new Types.ObjectId(hostUser.id),
      });

      const participantDoc = {
        status: ParticipantStatus.REQUESTED,
        role: ParticipantRole.STUDENT,
        joinedAt: null as any,
        save: vi.fn().mockResolvedValue(true),
      };
      mockParticipantModel.findOne.mockResolvedValue(participantDoc);

      const result = await service.acceptRequest('TDP8K2', studentUser.id, hostUser);
      expect(result.success).toBe(true);
      expect(participantDoc.status).toBe(ParticipantStatus.ACCEPTED);
      expect(participantDoc.joinedAt).toBeInstanceOf(Date);
      expect(mockClassroomGateway.notifyStudentAccepted).toHaveBeenCalled();
      expect(mockClassroomGateway.broadcastToClassroom).toHaveBeenCalledWith(
        'TDP8K2',
        'classroom:participant-updated',
        expect.any(Object),
      );
    });

    it('should reject non-host attempting to accept request with ForbiddenException', async () => {
      const classroomId = new Types.ObjectId();
      mockClassroomModel.findOne.mockResolvedValue({
        _id: classroomId,
        code: 'TDP8K2',
        hostId: new Types.ObjectId(hostUser.id), // Actual host
      });

      // studentUser attempts to accept
      await expect(
        service.acceptRequest('TDP8K2', 'someone-else', studentUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow host to reject pending student request', async () => {
      const classroomId = new Types.ObjectId();
      mockClassroomModel.findOne.mockResolvedValue({
        _id: classroomId,
        code: 'TDP8K2',
        hostId: new Types.ObjectId(hostUser.id),
      });

      const participantDoc = {
        status: ParticipantStatus.REQUESTED,
        save: vi.fn().mockResolvedValue(true),
      };
      mockParticipantModel.findOne.mockResolvedValue(participantDoc);

      const result = await service.rejectRequest('TDP8K2', studentUser.id, hostUser);
      expect(result.success).toBe(true);
      expect(participantDoc.status).toBe(ParticipantStatus.REJECTED);
      expect(mockClassroomGateway.notifyStudentRejected).toHaveBeenCalled();
    });
  });

  describe('leaveClassroom & endClassroom', () => {
    it('should update status to LEFT and broadcast classroom:user-left', async () => {
      const classroomId = new Types.ObjectId();
      mockClassroomModel.findOne.mockResolvedValue({
        _id: classroomId,
        code: 'TDP8K2',
      });

      const participantDoc = {
        status: ParticipantStatus.ACCEPTED,
        save: vi.fn().mockResolvedValue(true),
      };
      mockParticipantModel.findOne.mockResolvedValue(participantDoc);

      const result = await service.leaveClassroom('TDP8K2', studentUser);
      expect(result.success).toBe(true);
      expect(participantDoc.status).toBe(ParticipantStatus.LEFT);
      expect(mockClassroomGateway.broadcastToClassroom).toHaveBeenCalledWith(
        'TDP8K2',
        'classroom:user-left',
        expect.any(Object),
      );
    });

    it('should allow host to end classroom session', async () => {
      const classroomDoc = {
        _id: new Types.ObjectId(),
        code: 'TDP8K2',
        hostId: new Types.ObjectId(hostUser.id),
        status: ClassroomStatus.ACTIVE,
        endedAt: null as any,
        save: vi.fn().mockResolvedValue(true),
      };
      mockClassroomModel.findOne.mockResolvedValue(classroomDoc);

      const result = await service.endClassroom('TDP8K2', hostUser);
      expect(result.success).toBe(true);
      expect(classroomDoc.status).toBe(ClassroomStatus.ENDED);
      expect(classroomDoc.endedAt).toBeInstanceOf(Date);
      expect(mockClassroomGateway.broadcastToClassroom).toHaveBeenCalledWith(
        'TDP8K2',
        'classroom:ended',
        expect.any(Object),
      );
    });

    it('should throw ForbiddenException if non-host attempts to end classroom', async () => {
      const classroomDoc = {
        _id: new Types.ObjectId(),
        code: 'TDP8K2',
        hostId: new Types.ObjectId(hostUser.id),
        status: ClassroomStatus.ACTIVE,
      };
      mockClassroomModel.findOne.mockResolvedValue(classroomDoc);

      await expect(service.endClassroom('TDP8K2', studentUser)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('autoEndClassroomDueToInactivity', () => {
    it('should mark status as ENDED with INACTIVITY reason and broadcast to classroom', async () => {
      const classroomId = new Types.ObjectId();
      const classroomDoc = {
        _id: classroomId,
        code: 'TDP8K2',
        status: ClassroomStatus.ACTIVE,
        endedAt: null as any,
        endedReason: null as any,
        save: vi.fn().mockResolvedValue(true),
      };
      mockClassroomModel.findOne.mockResolvedValue(classroomDoc);

      mockParticipantModel.find.mockResolvedValue([]);

      await service.autoEndClassroomDueToInactivity('TDP8K2');

      expect(classroomDoc.status).toBe(ClassroomStatus.ENDED);
      expect(classroomDoc.endedReason).toBe('INACTIVITY');
      expect(mockClassroomGateway.broadcastToClassroom).toHaveBeenCalledWith(
        'TDP8K2',
        'classroom:ended',
        expect.objectContaining({
          reason: 'INACTIVITY',
        }),
      );
    });
  });

  describe('getTeacherHistory', () => {
    it('should return teacher past classrooms with participants and duration', async () => {
      const classroomId = new Types.ObjectId();
      const createdAt = new Date(Date.now() - 3600000);
      const endedAt = new Date();

      mockClassroomModel.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([
            {
              _id: classroomId,
              name: 'Java Programming',
              code: 'TDP8K2',
              status: ClassroomStatus.ENDED,
              createdAt,
              endedAt,
              endedReason: 'INACTIVITY',
            },
          ]),
        }),
      });

      mockParticipantModel.find.mockReturnValue({
        populate: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([
            {
              userId: { _id: studentUser.id, name: studentUser.name, email: studentUser.email },
              role: ParticipantRole.STUDENT,
              status: ParticipantStatus.ACCEPTED,
              joinedAt: createdAt,
              leftAt: endedAt,
              durationSeconds: 3600,
            },
          ]),
        }),
      });

      const result = await service.getTeacherHistory(hostUser.id);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].code).toBe('TDP8K2');
      expect(result.data[0].totalParticipantsCount).toBe(1);
      expect(result.data[0].participants[0].durationSeconds).toBe(3600);
      expect(result.data[0].participants[0].durationFormatted).toBe('1h');
    });
  });

  describe('getStudentHistory', () => {
    it('should return student attended classrooms with attendance duration', async () => {
      const classroomId = new Types.ObjectId();
      const createdAt = new Date(Date.now() - 3600000);
      const endedAt = new Date();

      mockParticipantModel.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([
            {
              classroomId,
              userId: new Types.ObjectId(studentUser.id),
              role: ParticipantRole.STUDENT,
              status: ParticipantStatus.ACCEPTED,
              joinedAt: createdAt,
              leftAt: endedAt,
              durationSeconds: 1800,
            },
          ]),
        }),
      });

      mockClassroomModel.findById.mockResolvedValue({
        _id: classroomId,
        name: 'Java Programming',
        code: 'TDP8K2',
        hostId: new Types.ObjectId(hostUser.id),
        status: ClassroomStatus.ENDED,
        createdAt,
        endedAt,
        endedReason: 'INACTIVITY',
      });

      const result = await service.getStudentHistory(studentUser.id);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].code).toBe('TDP8K2');
      expect(result.data[0].myAttendance.durationSeconds).toBe(1800);
      expect(result.data[0].myAttendance.durationFormatted).toBe('30m');
    });
  });

  describe('getAnalytics', () => {
    it('should return teacher metrics only for instructor, isolating hosted rooms', async () => {
      mockUsersService.findById.mockResolvedValue({
        _id: hostUser.id,
        name: hostUser.name,
        email: hostUser.email,
        role: 'TEACHER',
      });

      const createdAt = new Date(Date.now() - 3600000);
      const endedAt = new Date();
      const classroomId = new Types.ObjectId();

      mockClassroomModel.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([
            {
              _id: classroomId,
              name: 'Advanced React',
              code: 'REACT1',
              status: ClassroomStatus.ENDED,
              createdAt,
              endedAt,
              endedReason: 'HOST_ENDED',
            },
          ]),
        }),
      });

      mockParticipantModel.countDocuments.mockResolvedValue(5);
      mockParticipantModel.find.mockResolvedValue([
        { userId: new Types.ObjectId(studentUser.id), role: ParticipantRole.STUDENT },
      ]);

      const result = await service.getAnalytics(hostUser.id);
      expect(result.success).toBe(true);
      expect(result.data.role).toBe('TEACHER');
      expect(result.data.teacherSummary).toBeDefined();
      expect(result.data.teacherSummary.totalClassroomsHosted).toBe(1);
      expect(result.data.teacherSummary.endedClassroomsCount).toBe(1);
      expect(result.data.recentHostedSessions).toHaveLength(1);
      expect(result.data.recentHostedSessions[0].code).toBe('REACT1');
      // Must not expose student analytics
      expect(result.data.studentSummary).toBeNull();
      expect(result.data.recentAttendedSessions).toEqual([]);
    });

    it('should return student metrics only for student, isolating attended rooms', async () => {
      mockUsersService.findById.mockResolvedValue({
        _id: studentUser.id,
        name: studentUser.name,
        email: studentUser.email,
        role: 'STUDENT',
      });

      const classroomId = new Types.ObjectId();
      const createdAt = new Date(Date.now() - 1800000);

      mockParticipantModel.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([
            {
              classroomId,
              userId: new Types.ObjectId(studentUser.id),
              role: ParticipantRole.STUDENT,
              status: ParticipantStatus.ACCEPTED,
              joinedAt: createdAt,
              leftAt: new Date(),
              durationSeconds: 1800,
            },
          ]),
        }),
      });

      mockClassroomModel.findById.mockResolvedValue({
        _id: classroomId,
        name: 'Math 101',
        code: 'MATH01',
        hostId: new Types.ObjectId(hostUser.id),
        status: ClassroomStatus.ACTIVE,
        createdAt,
      });

      const result = await service.getAnalytics(studentUser.id);
      expect(result.success).toBe(true);
      expect(result.data.role).toBe('STUDENT');
      expect(result.data.studentSummary).toBeDefined();
      expect(result.data.studentSummary.totalClassesAttended).toBe(1);
      expect(result.data.studentSummary.totalLearningDurationSeconds).toBe(1800);
      expect(result.data.recentAttendedSessions).toHaveLength(1);
      expect(result.data.recentAttendedSessions[0].code).toBe('MATH01');
      // Must not expose teacher analytics
      expect(result.data.teacherSummary).toBeNull();
      expect(result.data.recentHostedSessions).toEqual([]);
    });
  });
});
