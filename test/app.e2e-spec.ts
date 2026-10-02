import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, BadRequestException } from '@nestjs/common';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';

import { HealthController } from '../src/health/health.controller.js';
import { AuthController } from '../src/auth/auth.controller.js';
import { AuthService } from '../src/auth/auth.service.js';
import { UsersController } from '../src/users/users.controller.js';
import { UsersService } from '../src/users/users.service.js';
import { ClassroomsController } from '../src/classrooms/classrooms.controller.js';
import { ClassroomsService } from '../src/classrooms/classrooms.service.js';
import { InstitutionsController } from '../src/institutions/institutions.controller.js';
import { InstitutionsService } from '../src/institutions/institutions.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard.js';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter.js';

describe('TDP Classroom Lite Backend (e2e)', () => {
  let app: INestApplication;

  const mockUser = {
    id: '507f1f77bcf86cd799439011',
    name: 'Abhishek Teacher',
    email: 'abhishek@example.com',
    role: 'TEACHER',
  };

  const mockAuthService = {
    signup: vi.fn().mockResolvedValue({
      success: true,
      data: {
        user: mockUser,
        accessToken: 'mock-e2e-token',
      },
    }),
    login: vi.fn().mockResolvedValue({
      success: true,
      data: {
        user: mockUser,
        accessToken: 'mock-e2e-token',
      },
    }),
    verifyEmail: vi.fn().mockImplementation(async (dto: any) => {
      if (dto.otp === '000000') {
        throw new BadRequestException('Invalid or expired verification code');
      }
      return {
        success: true,
        message: 'Email verified successfully',
        data: {
          user: { ...mockUser, isEmailVerified: true },
          accessToken: 'mock-verified-token',
        },
      };
    }),
    resendVerification: vi.fn().mockImplementation(async () => {
      return {
        success: true,
        message: 'Verification code resent successfully',
      };
    }),
    validateToken: vi.fn().mockResolvedValue({
      sub: mockUser.id,
      email: mockUser.email,
    }),
  };

  const mockUsersService = {
    findById: vi.fn().mockResolvedValue(mockUser),
    sanitizeUser: vi.fn().mockReturnValue(mockUser),
    deleteAccount: vi.fn().mockResolvedValue({
      success: true,
      message: 'Your account has been deleted successfully',
    }),
  };

  const mockClassroomsService = {
    createClassroom: vi.fn().mockResolvedValue({
      success: true,
      data: {
        id: '607f1f77bcf86cd799439022',
        name: 'Java Programming',
        code: 'TDP8K2',
        hostId: mockUser.id,
        status: 'ACTIVE',
      },
    }),
    getClassroom: vi.fn().mockResolvedValue({
      success: true,
      data: {
        id: '607f1f77bcf86cd799439022',
        name: 'Java Programming',
        code: 'TDP8K2',
        host: mockUser,
        status: 'ACTIVE',
        activePdf: null,
      },
    }),
    joinClassroom: vi.fn().mockResolvedValue({
      success: true,
      message: 'Join request sent',
      status: 'REQUESTED',
    }),
    getParticipants: vi.fn().mockResolvedValue({
      success: true,
      data: [
        {
          userId: mockUser.id,
          name: mockUser.name,
          role: 'HOST',
          status: 'ACCEPTED',
        },
      ],
    }),
    getRequests: vi.fn().mockResolvedValue({
      success: true,
      data: [
        {
          userId: '607f1f77bcf86cd799439033',
          name: 'Student One',
          email: 'student@example.com',
          status: 'REQUESTED',
        },
      ],
    }),
    acceptRequest: vi.fn().mockResolvedValue({
      success: true,
      message: 'Join request accepted',
      data: {
        userId: '607f1f77bcf86cd799439033',
        status: 'ACCEPTED',
      },
    }),
    rejectRequest: vi.fn().mockResolvedValue({
      success: true,
      message: 'Join request rejected',
      data: {
        userId: '607f1f77bcf86cd799439033',
        status: 'REJECTED',
      },
    }),
    leaveClassroom: vi.fn().mockResolvedValue({
      success: true,
      message: 'Left classroom successfully',
    }),
    endClassroom: vi.fn().mockResolvedValue({
      success: true,
      message: 'Classroom ended successfully',
    }),
    getTeacherHistory: vi.fn().mockResolvedValue({
      success: true,
      data: [
        {
          id: '607f1f77bcf86cd799439022',
          name: 'Java Programming',
          code: 'TDP8K2',
          status: 'ENDED',
          totalParticipantsCount: 1,
          participants: [
            {
              userId: '607f1f77bcf86cd799439033',
              name: 'Student One',
              durationSeconds: 1800,
              durationFormatted: '30m',
            },
          ],
        },
      ],
    }),
    getStudentHistory: vi.fn().mockResolvedValue({
      success: true,
      data: [
        {
          classroomId: '607f1f77bcf86cd799439022',
          name: 'Java Programming',
          code: 'TDP8K2',
          myAttendance: {
            durationSeconds: 1800,
            durationFormatted: '30m',
          },
        },
      ],
    }),
    getClassroomHistory: vi.fn().mockResolvedValue({
      success: true,
      data: {
        id: '607f1f77bcf86cd799439022',
        name: 'Java Programming',
        code: 'TDP8K2',
        totalParticipantsCount: 1,
        participants: [],
      },
    }),
  };

  const mockInstitutionsService = {
    create: vi.fn().mockResolvedValue({
      success: true,
      data: {
        id: 'inst-uuid-1',
        name: 'ABC Institute',
        code: 'TDP82K4',
        role: 'OWNER',
      },
    }),
    search: vi.fn().mockResolvedValue({
      success: true,
      data: [{ id: 'inst-uuid-1', name: 'ABC Institute', code: 'TDP82K4' }],
    }),
    getMyInstitutions: vi.fn().mockResolvedValue({
      success: true,
      data: [{ id: 'inst-uuid-1', name: 'ABC Institute', code: 'TDP82K4', role: 'TEACHER' }],
    }),
    getById: vi.fn().mockResolvedValue({
      success: true,
      data: { id: 'inst-uuid-1', name: 'ABC Institute', code: 'TDP82K4' },
    }),
    update: vi.fn().mockResolvedValue({
      success: true,
      data: { id: 'inst-uuid-1', name: 'ABC Institute Updated' },
    }),
    joinById: vi.fn().mockResolvedValue({
      success: true,
      message: 'Join request submitted successfully',
    }),
    joinByCode: vi.fn().mockResolvedValue({
      success: true,
      message: 'Join request submitted successfully',
    }),
    getRequests: vi.fn().mockResolvedValue({
      success: true,
      data: [{ id: 'req-1', userId: 'user-2', role: 'STUDENT', status: 'REQUESTED' }],
    }),
    acceptRequest: vi.fn().mockResolvedValue({
      success: true,
      message: 'Institution join request accepted successfully',
    }),
    rejectRequest: vi.fn().mockResolvedValue({
      success: true,
      message: 'Institution join request rejected',
    }),
    removeMember: vi.fn().mockResolvedValue({
      success: true,
      message: 'Member removed from institution',
    }),
    leave: vi.fn().mockResolvedValue({
      success: true,
      message: 'Successfully left the institution',
    }),
    getMembers: vi.fn().mockResolvedValue({
      success: true,
      data: [{ id: 'user-2', name: 'Student One', role: 'STUDENT' }],
    }),
    getStats: vi.fn().mockResolvedValue({
      success: true,
      data: { teachers: 2, students: 50, totalMembers: 52 },
    }),
    delete: vi.fn().mockResolvedValue({
      success: true,
      message: 'Institution deleted successfully',
    }),
    setAdminRole: vi.fn().mockResolvedValue({
      success: true,
      message: 'Member has been appointed as an Administrator',
    }),
    transferOwnership: vi.fn().mockResolvedValue({
      success: true,
      message: 'Institution ownership transferred successfully',
    }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [
        HealthController,
        AuthController,
        UsersController,
        InstitutionsController,
        ClassroomsController,
      ],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: UsersService, useValue: mockUsersService },
        { provide: InstitutionsService, useValue: mockInstitutionsService },
        { provide: ClassroomsService, useValue: mockClassroomsService },
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: vi.fn().mockReturnValue('mock-jwt-token'),
            verify: vi.fn().mockReturnValue({ sub: mockUser.id, email: mockUser.email }),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          const req = context.switchToHttp().getRequest();
          req.user = mockUser;
          return true;
        },
      })
      .overrideGuard(ThrottlerGuard)
      .useValue({
        canActivate: () => true,
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: false,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('should return 200 with service and database ok', async () => {
      const response = await request(app.getHttpServer()).get('/health').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.status).toBe('ok');
      expect(response.body.service).toBe('tdp-classroom-lite-backend');
      expect(response.body.database).toBe('connected');
    });
  });

  describe('POST /auth/signup', () => {
    it('should register a new user and return token', async () => {
      const payload = {
        name: 'Abhishek',
        email: 'abhishek@example.com',
        password: 'password123',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/signup')
        .send(payload)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(payload.email);
      expect(response.body.data.accessToken).toBe('mock-e2e-token');
    });

    it('should reject invalid signup data with 400', async () => {
      const payload = {
        name: '',
        email: 'invalid-email',
        password: '123',
      };

      await request(app.getHttpServer()).post('/auth/signup').send(payload).expect(400);
    });
  });

  describe('POST /auth/login', () => {
    it('should authenticate user and return token', async () => {
      const payload = {
        email: 'abhishek@example.com',
        password: 'password123',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(payload)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.accessToken).toBe('mock-e2e-token');
    });
  });

  describe('POST /auth/verify-email', () => {
    it('should verify email with valid OTP and return token', async () => {
      const payload = {
        email: 'abhishek@example.com',
        otp: '123456',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/verify-email')
        .send(payload)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.accessToken).toBe('mock-verified-token');
      expect(response.body.data.user.isEmailVerified).toBe(true);
    });

    it('should reject invalid OTP with 400', async () => {
      const payload = {
        email: 'abhishek@example.com',
        otp: '000000',
      };

      await request(app.getHttpServer())
        .post('/auth/verify-email')
        .send(payload)
        .expect(400);
    });

    it('should reject malformed OTP with validation error 400', async () => {
      const payload = {
        email: 'abhishek@example.com',
        otp: '12',
      };

      await request(app.getHttpServer())
        .post('/auth/verify-email')
        .send(payload)
        .expect(400);
    });
  });

  describe('POST /auth/resend-verification', () => {
    it('should resend verification OTP successfully', async () => {
      const payload = {
        email: 'abhishek@example.com',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/resend-verification')
        .send(payload)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Verification code resent successfully');
    });

    it('should reject missing email with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/resend-verification')
        .send({})
        .expect(400);
    });
  });

  describe('GET /users/me', () => {
    it('should return current user profile', async () => {
      const response = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', 'Bearer mock-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toBe(mockUser.email);
    });

    it('DELETE /users/me - should delete user account', async () => {
      const response = await request(app.getHttpServer())
        .delete('/users/me')
        .set('Authorization', 'Bearer mock-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Your account has been deleted successfully');
    });
  });

  describe('INSTITUTIONS ENDPOINTS', () => {
    it('POST /institutions - should create an institution', async () => {
      const response = await request(app.getHttpServer())
        .post('/institutions')
        .send({ name: 'ABC Institute' })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('ABC Institute');
    });

    it('GET /institutions/search - should search institutions', async () => {
      const response = await request(app.getHttpServer())
        .get('/institutions/search?q=abc')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('GET /institutions/my - should return my institutions', async () => {
      const response = await request(app.getHttpServer())
        .get('/institutions/my')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('POST /institutions/join-by-code - should submit join request by code', async () => {
      const response = await request(app.getHttpServer())
        .post('/institutions/join-by-code')
        .send({ code: 'TDP82K4' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('GET /institutions/:id/stats - should return institution stats', async () => {
      const response = await request(app.getHttpServer())
        .get('/institutions/inst-uuid-1/stats')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.totalMembers).toBe(52);
    });

    it('GET /institutions/:id/members - should return members list', async () => {
      const response = await request(app.getHttpServer())
        .get('/institutions/inst-uuid-1/members')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('POST /institutions/:id/requests/:userId/accept - should accept request', async () => {
      const response = await request(app.getHttpServer())
        .post('/institutions/inst-uuid-1/requests/user-2/accept')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('POST /institutions/:id/requests/:userId/reject - should reject request', async () => {
      const response = await request(app.getHttpServer())
        .post('/institutions/inst-uuid-1/requests/user-2/reject')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('DELETE /institutions/:id/members/:userId - should remove member', async () => {
      const response = await request(app.getHttpServer())
        .delete('/institutions/inst-uuid-1/members/user-2')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('POST /institutions/:id/leave - should leave institution', async () => {
      const response = await request(app.getHttpServer())
        .post('/institutions/inst-uuid-1/leave')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('DELETE /institutions/:id - should delete institution', async () => {
      const response = await request(app.getHttpServer())
        .delete('/institutions/inst-uuid-1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Institution deleted successfully');
    });

    it('PATCH /institutions/:id/members/:userId/admin - should set member as admin', async () => {
      const response = await request(app.getHttpServer())
        .patch('/institutions/inst-uuid-1/members/user-2/admin')
        .send({ isAdmin: true })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Member has been appointed as an Administrator');
    });

    it('POST /institutions/:id/transfer-ownership - should transfer ownership to another teacher', async () => {
      const response = await request(app.getHttpServer())
        .post('/institutions/inst-uuid-1/transfer-ownership')
        .send({ newOwnerId: '550e8400-e29b-41d4-a716-446655440000' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Institution ownership transferred successfully');
    });
  });

  describe('CLASSROOMS ENDPOINTS', () => {
    it('POST /classrooms - should create a new classroom', async () => {
      const response = await request(app.getHttpServer())
        .post('/classrooms')
        .send({ name: 'Java Programming' })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.code).toBe('TDP8K2');
      expect(response.body.data.hostId).toBe(mockUser.id);
    });

    it('GET /classrooms/:code - should return classroom details', async () => {
      const response = await request(app.getHttpServer())
        .get('/classrooms/TDP8K2')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.code).toBe('TDP8K2');
    });

    it('POST /classrooms/:code/join - should create join request', async () => {
      const response = await request(app.getHttpServer())
        .post('/classrooms/TDP8K2/join')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.status).toBe('REQUESTED');
    });

    it('GET /classrooms/:code/participants - should return accepted participants', async () => {
      const response = await request(app.getHttpServer())
        .get('/classrooms/TDP8K2/participants')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('GET /classrooms/:code/requests - should return join requests for host', async () => {
      const response = await request(app.getHttpServer())
        .get('/classrooms/TDP8K2/requests')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('POST /classrooms/:code/requests/:userId/accept - should accept student request', async () => {
      const response = await request(app.getHttpServer())
        .post('/classrooms/TDP8K2/requests/607f1f77bcf86cd799439033/accept')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('ACCEPTED');
    });

    it('POST /classrooms/:code/requests/:userId/reject - should reject student request', async () => {
      const response = await request(app.getHttpServer())
        .post('/classrooms/TDP8K2/requests/607f1f77bcf86cd799439033/reject')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('REJECTED');
    });

    it('POST /classrooms/:code/leave - should leave classroom', async () => {
      const response = await request(app.getHttpServer())
        .post('/classrooms/TDP8K2/leave')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('POST /classrooms/:code/end - should end classroom', async () => {
      const response = await request(app.getHttpServer())
        .post('/classrooms/TDP8K2/end')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('GET /classrooms/history/teacher - should return teacher past classrooms', async () => {
      const response = await request(app.getHttpServer())
        .get('/classrooms/history/teacher')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('GET /classrooms/history/student - should return student past classes', async () => {
      const response = await request(app.getHttpServer())
        .get('/classrooms/history/student')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('GET /classrooms/:code/history - should return classroom report', async () => {
      const response = await request(app.getHttpServer())
        .get('/classrooms/TDP8K2/history')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.code).toBe('TDP8K2');
    });
  });
});
