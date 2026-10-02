import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  UserRole,
  InstitutionRole,
  MembershipStatus,
  InstitutionStatus,
} from '@prisma/client';
import { InstitutionsService } from './institutions.service.js';

describe('InstitutionsService', () => {
  let service: InstitutionsService;
  let mockPrisma: any;
  let mockGateway: any;

  const mockTeacher = {
    id: 'teacher-uuid',
    name: 'Professor Rao',
    email: 'rao@example.com',
    role: UserRole.TEACHER,
  };

  const mockStudent = {
    id: 'student-uuid',
    name: 'Rahul Kumar',
    email: 'rahul@example.com',
    role: UserRole.STUDENT,
  };

  const mockInstitution = {
    id: 'inst-uuid',
    name: 'ABC Institute',
    code: 'TDP82K4',
    ownerId: mockTeacher.id,
    status: InstitutionStatus.ACTIVE,
    createdAt: new Date(),
  };

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: vi.fn(),
      },
      institution: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      institutionMembership: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => {
        return callback(mockPrisma);
      }),
    };

    mockGateway = {
      emitToUser: vi.fn(),
      emitToUsers: vi.fn(),
    };

    service = new InstitutionsService(mockPrisma, mockGateway);
  });

  describe('create', () => {
    it('should create institution and OWNER membership when user is TEACHER', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockTeacher);
      mockPrisma.institution.findUnique.mockResolvedValue(null);
      mockPrisma.institution.create.mockResolvedValue(mockInstitution);
      mockPrisma.institutionMembership.create.mockResolvedValue({
        id: 'mem-1',
        institutionId: mockInstitution.id,
        userId: mockTeacher.id,
        role: InstitutionRole.OWNER,
        status: MembershipStatus.ACCEPTED,
      });

      const result = await service.create(mockTeacher.id, {
        name: 'ABC Institute',
      });

      expect(result.success).toBe(true);
      expect(result.data.name).toBe('ABC Institute');
      expect(result.data.role).toBe(InstitutionRole.OWNER);
    });

    it('should throw ForbiddenException if non-teacher tries to create institution', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockStudent);

      await expect(
        service.create(mockStudent.id, { name: 'Student College' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('search', () => {
    it('should return public institution details', async () => {
      mockPrisma.institution.findMany.mockResolvedValue([
        { id: 'inst-1', name: 'ABC Institute', code: 'TDP82K4', logo: null, description: null },
      ]);

      const result = await service.search('ABC');
      expect(result.success).toBe(true);
      expect(result.data.length).toBe(1);
      expect(result.data[0].code).toBe('TDP82K4');
    });
  });

  describe('joinByCode', () => {
    it('should submit join request with user role and REQUESTED status', async () => {
      mockPrisma.institution.findUnique.mockResolvedValue(mockInstitution);
      mockPrisma.user.findUnique.mockResolvedValue(mockStudent);
      mockPrisma.institutionMembership.findUnique.mockResolvedValue(null);
      mockPrisma.institutionMembership.create.mockResolvedValue({
        id: 'mem-2',
        institutionId: mockInstitution.id,
        userId: mockStudent.id,
        role: InstitutionRole.STUDENT,
        status: MembershipStatus.REQUESTED,
        requestedAt: new Date(),
      });

      const result = await service.joinByCode('TDP82K4', mockStudent);
      expect(result.success).toBe(true);
      expect(result.data.status).toBe(MembershipStatus.REQUESTED);
    });

    it('should throw BadRequestException if already accepted member', async () => {
      mockPrisma.institution.findUnique.mockResolvedValue(mockInstitution);
      mockPrisma.user.findUnique.mockResolvedValue(mockStudent);
      mockPrisma.institutionMembership.findUnique.mockResolvedValue({
        id: 'mem-2',
        status: MembershipStatus.ACCEPTED,
      });

      await expect(service.joinByCode('TDP82K4', mockStudent)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('acceptRequest', () => {
    it('should allow OWNER to accept student request and emit socket notification', async () => {
      mockPrisma.institution.findUnique.mockResolvedValue(mockInstitution);
      mockPrisma.institutionMembership.findUnique.mockResolvedValue({
        id: 'mem-2',
        institutionId: mockInstitution.id,
        userId: mockStudent.id,
        role: InstitutionRole.STUDENT,
        status: MembershipStatus.REQUESTED,
      });

      mockPrisma.institutionMembership.update.mockResolvedValue({
        id: 'mem-2',
        status: MembershipStatus.ACCEPTED,
        role: InstitutionRole.STUDENT,
        acceptedAt: new Date(),
        institution: { id: mockInstitution.id, name: mockInstitution.name },
      });

      const result = await service.acceptRequest(
        mockInstitution.id,
        mockStudent.id,
        mockTeacher,
      );

      expect(result.success).toBe(true);
      expect(result.data.status).toBe(MembershipStatus.ACCEPTED);
      expect(mockGateway.emitToUser).toHaveBeenCalledWith(
        mockStudent.id,
        'institution:member:accepted',
        expect.any(Object),
      );
    });
  });

  describe('rejectRequest', () => {
    it('should reject pending request and emit socket notification', async () => {
      mockPrisma.institution.findUnique.mockResolvedValue(mockInstitution);
      mockPrisma.institutionMembership.findUnique.mockResolvedValue({
        id: 'mem-2',
        institutionId: mockInstitution.id,
        userId: mockStudent.id,
        status: MembershipStatus.REQUESTED,
      });

      mockPrisma.institutionMembership.update.mockResolvedValue({
        id: 'mem-2',
        status: MembershipStatus.REJECTED,
        institution: { id: mockInstitution.id, name: mockInstitution.name },
      });

      const result = await service.rejectRequest(
        mockInstitution.id,
        mockStudent.id,
        mockTeacher,
      );

      expect(result.success).toBe(true);
      expect(result.data.status).toBe(MembershipStatus.REJECTED);
      expect(mockGateway.emitToUser).toHaveBeenCalledWith(
        mockStudent.id,
        'institution:member:rejected',
        expect.any(Object),
      );
    });
  });

  describe('leave', () => {
    it('should disallow OWNER from leaving their own institution', async () => {
      mockPrisma.institutionMembership.findUnique.mockResolvedValue({
        id: 'mem-owner',
        role: InstitutionRole.OWNER,
        status: MembershipStatus.ACCEPTED,
      });

      await expect(service.leave(mockInstitution.id, mockTeacher)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should allow student member to leave', async () => {
      mockPrisma.institutionMembership.findUnique.mockResolvedValue({
        id: 'mem-student',
        role: InstitutionRole.STUDENT,
        status: MembershipStatus.ACCEPTED,
      });

      mockPrisma.institutionMembership.update.mockResolvedValue({
        id: 'mem-student',
        status: MembershipStatus.LEFT,
      });

      const result = await service.leave(mockInstitution.id, mockStudent);
      expect(result.success).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return teacher and student counts', async () => {
      mockPrisma.institution.findUnique.mockResolvedValue(mockInstitution);
      mockPrisma.institutionMembership.findUnique.mockResolvedValue({
        id: 'mem-1',
        status: MembershipStatus.ACCEPTED,
      });
      mockPrisma.institutionMembership.count
        .mockResolvedValueOnce(5) // teachers
        .mockResolvedValueOnce(50); // students

      const result = await service.getStats(mockInstitution.id, mockTeacher);
      expect(result.success).toBe(true);
      expect(result.data.teachers).toBe(5);
      expect(result.data.students).toBe(50);
      expect(result.data.totalMembers).toBe(55);
    });
  });

  describe('delete', () => {
    it('should allow the owner to delete the institution', async () => {
      mockPrisma.institution.findUnique.mockResolvedValue(mockInstitution);
      mockPrisma.institution.delete.mockResolvedValue(mockInstitution);

      const result = await service.delete(mockInstitution.id, mockTeacher);
      expect(result.success).toBe(true);
      expect(result.message).toBe('Institution deleted successfully');
      expect(mockPrisma.institution.delete).toHaveBeenCalledWith({
        where: { id: mockInstitution.id },
      });
    });

    it('should disallow a non-owner from deleting the institution', async () => {
      mockPrisma.institution.findUnique.mockResolvedValue(mockInstitution);

      await expect(service.delete(mockInstitution.id, mockStudent)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw NotFoundException if institution does not exist', async () => {
      mockPrisma.institution.findUnique.mockResolvedValue(null);

      await expect(service.delete('non-existent-id', mockTeacher)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
