import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { UserRole, InstitutionRole, MembershipStatus, InstitutionStatus } from '@prisma/client';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  let authService: AuthService;
  let mockPrisma: any;
  let mockUsersService: any;
  let mockJwtService: any;
  let mockEmailService: any;

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      institution: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      institutionMembership: {
        create: vi.fn(),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => {
        return callback(mockPrisma);
      }),
    };

    mockUsersService = {
      sanitizeUser: vi.fn((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      })),
    };

    mockJwtService = {
      sign: vi.fn().mockReturnValue('mock-jwt-token'),
      verify: vi.fn(),
    };

    mockEmailService = {
      sendVerificationOtp: vi.fn().mockResolvedValue(true),
    };

    authService = new AuthService(
      mockPrisma,
      mockUsersService,
      mockJwtService,
      mockEmailService,
    );
  });

  describe('signup', () => {
    it('should successfully register a student without institutions', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-uuid-1',
        name: 'Abhishek',
        email: 'abhishek@example.com',
        role: UserRole.STUDENT,
        passwordHash: 'hashedPassword',
      });

      const result = await authService.signup({
        name: 'Abhishek',
        email: 'abhishek@example.com',
        password: 'password123',
        role: 'STUDENT',
      });

      expect(result.success).toBe(true);
      expect(result.data.user.email).toBe('abhishek@example.com');
      expect(result.data.accessToken).toBe('mock-jwt-token');
      expect(mockPrisma.user.create).toHaveBeenCalled();
    });

    it('should register a teacher creating their own institution', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'teacher-uuid-1',
        name: 'Professor Rao',
        email: 'rao@example.com',
        role: UserRole.TEACHER,
        passwordHash: 'hashedPassword',
      });

      mockPrisma.institution.findUnique.mockResolvedValue(null);
      mockPrisma.institution.create.mockResolvedValue({
        id: 'inst-uuid-1',
        name: 'Rao Institute',
        code: 'TDP82K4',
        ownerId: 'teacher-uuid-1',
        status: InstitutionStatus.ACTIVE,
      });

      mockPrisma.institutionMembership.create.mockResolvedValue({
        id: 'mem-uuid-1',
        institutionId: 'inst-uuid-1',
        userId: 'teacher-uuid-1',
        role: InstitutionRole.OWNER,
        status: MembershipStatus.ACCEPTED,
      });

      const result = await authService.signup({
        name: 'Professor Rao',
        email: 'rao@example.com',
        password: 'password123',
        role: 'TEACHER',
        institutionName: 'Rao Institute',
      });

      expect(result.success).toBe(true);
      expect(mockPrisma.institution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Rao Institute',
            ownerId: 'teacher-uuid-1',
          }),
        }),
      );
      expect(mockPrisma.institutionMembership.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: InstitutionRole.OWNER,
            status: MembershipStatus.ACCEPTED,
          }),
        }),
      );
    });

    it('should register a student selecting multiple institutions to join', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'student-uuid-1',
        name: 'Rahul',
        email: 'rahul@example.com',
        role: UserRole.STUDENT,
        passwordHash: 'hashedPassword',
      });

      mockPrisma.institution.findUnique
        .mockResolvedValueOnce({ id: 'inst-1', name: 'ABC', status: InstitutionStatus.ACTIVE })
        .mockResolvedValueOnce({ id: 'inst-2', name: 'XYZ', status: InstitutionStatus.ACTIVE });

      const result = await authService.signup({
        name: 'Rahul',
        email: 'rahul@example.com',
        password: 'password123',
        role: 'STUDENT',
        institutionIds: ['inst-1', 'inst-2'],
      });

      expect(result.success).toBe(true);
      expect(mockPrisma.institutionMembership.create).toHaveBeenCalledTimes(2);
    });

    it('should throw ConflictException on duplicate email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing-id', email: 'existing@example.com' });

      await expect(
        authService.signup({
          name: 'Test',
          email: 'existing@example.com',
          password: 'password123',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should successfully authenticate and return token', async () => {
      const hashedPassword = await bcrypt.hash('password123', 10);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-uuid-1',
        name: 'Abhishek',
        email: 'abhishek@example.com',
        passwordHash: hashedPassword,
        role: UserRole.STUDENT,
        isEmailVerified: true,
      });

      const result = await authService.login({
        email: 'abhishek@example.com',
        password: 'password123',
      });

      expect(result.success).toBe(true);
      expect(result.data.accessToken).toBe('mock-jwt-token');
      expect(result.data.user.email).toBe('abhishek@example.com');
    });

    it('should throw UnauthorizedException if email is not verified', async () => {
      const hashedPassword = await bcrypt.hash('password123', 10);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-uuid-1',
        name: 'Abhishek',
        email: 'abhishek@example.com',
        passwordHash: hashedPassword,
        role: UserRole.STUDENT,
        isEmailVerified: false,
      });
      mockPrisma.user.update.mockResolvedValue({});

      await expect(
        authService.login({
          email: 'abhishek@example.com',
          password: 'password123',
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockEmailService.sendVerificationOtp).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException on invalid password', async () => {
      const hashedPassword = await bcrypt.hash('password123', 10);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-uuid-1',
        name: 'Abhishek',
        email: 'abhishek@example.com',
        passwordHash: hashedPassword,
      });

      await expect(
        authService.login({
          email: 'abhishek@example.com',
          password: 'wrongpassword',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException on non-existent user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        authService.login({
          email: 'notfound@example.com',
          password: 'password123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('validateToken', () => {
    it('should return payload when token is valid', async () => {
      const payload = { sub: 'user-uuid-1', email: 'abhishek@example.com' };
      mockJwtService.verify.mockReturnValue(payload);

      const result = await authService.validateToken('valid-token');
      expect(result).toEqual(payload);
    });

    it('should return null when token verification throws', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      const result = await authService.validateToken('bad-token');
      expect(result).toBeNull();
    });
  });
});
