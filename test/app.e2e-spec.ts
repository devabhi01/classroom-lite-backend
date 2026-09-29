import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { getConnectionToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';

import { HealthController } from '../src/health/health.controller.js';
import { AuthController } from '../src/auth/auth.controller.js';
import { AuthService } from '../src/auth/auth.service.js';
import { UsersController } from '../src/users/users.controller.js';
import { UsersService } from '../src/users/users.service.js';
import { ClassroomsController } from '../src/classrooms/classrooms.controller.js';
import { ClassroomsService } from '../src/classrooms/classrooms.service.js';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard.js';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter.js';

describe('TDP Classroom Lite Backend (e2e)', () => {
  let app: INestApplication;

  const mockUser = {
    id: '507f1f77bcf86cd799439011',
    name: 'Abhishek Teacher',
    email: 'abhishek@example.com',
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
    validateToken: vi.fn().mockResolvedValue({
      sub: mockUser.id,
      email: mockUser.email,
    }),
  };

  const mockUsersService = {
    findById: vi.fn().mockResolvedValue(mockUser),
    sanitizeUser: vi.fn().mockReturnValue(mockUser),
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

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [
        HealthController,
        AuthController,
        UsersController,
        ClassroomsController,
      ],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: UsersService, useValue: mockUsersService },
        { provide: ClassroomsService, useValue: mockClassroomsService },
        {
          provide: getConnectionToken(),
          useValue: { readyState: 1 },
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
      expect(response.body.database).toBe('connected');
    });
  });

  describe('POST /auth/signup', () => {
    it('should register user and return 201', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          name: 'Abhishek Teacher',
          email: 'abhishek@example.com',
          password: 'password123',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.accessToken).toBe('mock-e2e-token');
      expect(response.body.data.user.email).toBe('abhishek@example.com');
    });

    it('should accept signup with role and ignore extra frontend fields without throwing 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          name: 'Abhishek Teacher',
          email: 'abhishek@example.com',
          password: 'password123',
          role: 'TEACHER',
          extraFrontendField: 'ignored',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.accessToken).toBe('mock-e2e-token');
    });

    it('should reject invalid email format with 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          name: 'Abhishek',
          email: 'not-an-email',
          password: '123',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /auth/login', () => {
    it('should authenticate user and return 200', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'abhishek@example.com',
          password: 'password123',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.accessToken).toBe('mock-e2e-token');
    });
  });

  describe('GET /users/me', () => {
    it('should return current authenticated user', async () => {
      const response = await request(app.getHttpServer())
        .get('/users/me')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(mockUser.name);
    });
  });

  describe('POST /classrooms', () => {
    it('should create classroom and return 201', async () => {
      const response = await request(app.getHttpServer())
        .post('/classrooms')
        .send({ name: 'Java Programming' })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.code).toBe('TDP8K2');
      expect(response.body.data.name).toBe('Java Programming');
    });

    it('should reject short classroom names with 400', async () => {
      await request(app.getHttpServer())
        .post('/classrooms')
        .send({ name: 'J' })
        .expect(400);
    });
  });

  describe('GET /classrooms/:code', () => {
    it('should return classroom metadata', async () => {
      const response = await request(app.getHttpServer())
        .get('/classrooms/TDP8K2')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.code).toBe('TDP8K2');
    });
  });

  describe('POST /classrooms/:code/join', () => {
    it('should submit join request and return 200', async () => {
      const response = await request(app.getHttpServer())
        .post('/classrooms/TDP8K2/join')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.status).toBe('REQUESTED');
    });
  });

  describe('GET /classrooms/:code/participants', () => {
    it('should list accepted participants', async () => {
      const response = await request(app.getHttpServer())
        .get('/classrooms/TDP8K2/participants')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('GET /classrooms/:code/requests', () => {
    it('should list pending join requests for host', async () => {
      const response = await request(app.getHttpServer())
        .get('/classrooms/TDP8K2/requests')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('POST /classrooms/:code/requests/:userId/accept', () => {
    it('should accept student join request', async () => {
      const response = await request(app.getHttpServer())
        .post('/classrooms/TDP8K2/requests/607f1f77bcf86cd799439033/accept')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('ACCEPTED');
    });
  });

  describe('POST /classrooms/:code/requests/:userId/reject', () => {
    it('should reject student join request', async () => {
      const response = await request(app.getHttpServer())
        .post('/classrooms/TDP8K2/requests/607f1f77bcf86cd799439033/reject')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('REJECTED');
    });
  });

  describe('POST /classrooms/:code/leave', () => {
    it('should allow participant to leave', async () => {
      const response = await request(app.getHttpServer())
        .post('/classrooms/TDP8K2/leave')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /classrooms/:code/end', () => {
    it('should allow host to end classroom', async () => {
      const response = await request(app.getHttpServer())
        .post('/classrooms/TDP8K2/end')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /classrooms/history/teacher', () => {
    it('should return teacher past classrooms history with who joined and duration', async () => {
      const response = await request(app.getHttpServer())
        .get('/classrooms/history/teacher')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data[0].code).toBe('TDP8K2');
      expect(response.body.data[0].participants[0].durationSeconds).toBe(1800);
      expect(response.body.data[0].participants[0].durationFormatted).toBe('30m');
    });
  });

  describe('GET /classrooms/history/student', () => {
    it('should return student past attended classes history with duration', async () => {
      const response = await request(app.getHttpServer())
        .get('/classrooms/history/student')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data[0].code).toBe('TDP8K2');
      expect(response.body.data[0].myAttendance.durationSeconds).toBe(1800);
      expect(response.body.data[0].myAttendance.durationFormatted).toBe('30m');
    });
  });

  describe('GET /classrooms/:code/history', () => {
    it('should return detailed report for a specific classroom', async () => {
      const response = await request(app.getHttpServer())
        .get('/classrooms/TDP8K2/history')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.code).toBe('TDP8K2');
    });
  });
});
