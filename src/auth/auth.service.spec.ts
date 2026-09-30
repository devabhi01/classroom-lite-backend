import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  let authService: AuthService;
  let mockUsersService: any;
  let mockJwtService: any;
  let mockMailService: any;
  let mockSmsService: any;

  beforeEach(() => {
    mockUsersService = {
      findByEmail: vi.fn(),
      findByPhone: vi.fn(),
      create: vi.fn(),
      findById: vi.fn(),
      findByVerificationToken: vi.fn(),
      findByVerificationOtp: vi.fn(),
      markEmailAsVerified: vi.fn(),
      setVerificationData: vi.fn(),
      sanitizeUser: vi.fn((user) => ({
        id: user._id ? user._id.toString() : user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        isEmailVerified: user.isEmailVerified ?? false,
      })),
    };

    mockJwtService = {
      sign: vi.fn().mockReturnValue('mock-jwt-token'),
      verify: vi.fn(),
    };

    mockMailService = {
      sendVerificationEmail: vi.fn().mockResolvedValue(true),
    };

    mockSmsService = {
      sendOtp: vi.fn().mockResolvedValue(true),
    };

    authService = new AuthService(
      mockUsersService,
      mockJwtService,
      mockMailService,
      mockSmsService,
    );
  });

  describe('signup', () => {
    it('should successfully register a new user and send confirmation email', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        name: 'Abhishek',
        email: 'abhishek@example.com',
        passwordHash: 'hashedPassword',
        isEmailVerified: false,
      });

      const result = await authService.signup({
        name: 'Abhishek',
        email: 'abhishek@example.com',
        password: 'password123',
      });

      expect(result.success).toBe(true);
      expect(result.data.requiresVerification).toBe(true);
      expect(result.data.email).toBe('abhishek@example.com');
      expect(mockUsersService.create).toHaveBeenCalled();
      expect(mockMailService.sendVerificationEmail).toHaveBeenCalled();
      expect(mockSmsService.sendOtp).not.toHaveBeenCalled();
    });

    it('should send SMS OTP when phone is provided at signup', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        name: 'Abhishek',
        email: 'abhishek@example.com',
        phone: '+919876543210',
        passwordHash: 'hashedPassword',
        isEmailVerified: false,
      });

      const result = await authService.signup({
        name: 'Abhishek',
        email: 'abhishek@example.com',
        phone: '+919876543210',
        password: 'password123',
      });

      expect(result.success).toBe(true);
      expect(mockMailService.sendVerificationEmail).toHaveBeenCalled();
      expect(mockSmsService.sendOtp).toHaveBeenCalledWith(
        '+919876543210',
        expect.any(String),
        'Abhishek',
      );
    });

    it('should pass role to usersService.create when provided', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        name: 'Abhishek',
        email: 'abhishek@example.com',
        role: 'TEACHER',
        passwordHash: 'hashedPassword',
        isEmailVerified: false,
      });

      const result = await authService.signup({
        name: 'Abhishek',
        email: 'abhishek@example.com',
        password: 'password123',
        role: 'TEACHER',
      });

      expect(result.success).toBe(true);
      expect(mockUsersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'TEACHER', isEmailVerified: false }),
      );
    });

    it('should throw ConflictException on duplicate email', async () => {
      mockUsersService.findByEmail.mockResolvedValue({
        _id: 'existing-id',
        email: 'abhishek@example.com',
      });

      await expect(
        authService.signup({
          name: 'Abhishek',
          email: 'abhishek@example.com',
          password: 'password123',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('verifyEmail', () => {
    it('should successfully verify with valid token and return access token', async () => {
      const mockUser = {
        _id: '507f1f77bcf86cd799439011',
        name: 'Abhishek',
        email: 'abhishek@example.com',
        isEmailVerified: false,
        toObject: () => ({ name: 'Abhishek', email: 'abhishek@example.com' }),
      };
      mockUsersService.findByVerificationToken.mockResolvedValue(mockUser);
      mockUsersService.markEmailAsVerified.mockResolvedValue({
        ...mockUser,
        isEmailVerified: true,
      });

      const result = await authService.verifyEmail({ token: 'valid-token' });

      expect(result.success).toBe(true);
      expect(result.data.accessToken).toBe('mock-jwt-token');
      expect(mockUsersService.markEmailAsVerified).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
    });

    it('should successfully verify with valid 6-digit OTP code using phone', async () => {
      const mockUser = {
        _id: '507f1f77bcf86cd799439011',
        name: 'Abhishek',
        email: 'abhishek@example.com',
        phone: '+919876543210',
        isEmailVerified: false,
        toObject: () => ({ name: 'Abhishek', email: 'abhishek@example.com', phone: '+919876543210' }),
      };
      mockUsersService.findByVerificationOtp.mockResolvedValue(mockUser);
      mockUsersService.markEmailAsVerified.mockResolvedValue({
        ...mockUser,
        isEmailVerified: true,
      });

      const result = await authService.verifyEmail({ phone: '+919876543210', code: '123456' });

      expect(result.success).toBe(true);
      expect(result.data.accessToken).toBe('mock-jwt-token');
      expect(mockUsersService.findByVerificationOtp).toHaveBeenCalledWith('+919876543210', '123456');
    });

    it('should throw BadRequestException if token or OTP is invalid or expired', async () => {
      mockUsersService.findByVerificationToken.mockResolvedValue(null);

      await expect(authService.verifyEmail({ token: 'invalid-token' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('login', () => {
    it('should successfully authenticate user with correct password and verified email', async () => {
      const hashedPassword = await bcrypt.hash('password123', 10);
      mockUsersService.findByEmail.mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        name: 'Abhishek',
        email: 'abhishek@example.com',
        passwordHash: hashedPassword,
        isEmailVerified: true,
      });

      const result = await authService.login({
        email: 'abhishek@example.com',
        password: 'password123',
      });

      expect(result.success).toBe(true);
      expect(result.data.user.name).toBe('Abhishek');
      expect(result.data.accessToken).toBe('mock-jwt-token');
    });

    it('should reject login if email is unverified', async () => {
      const hashedPassword = await bcrypt.hash('password123', 10);
      mockUsersService.findByEmail.mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        name: 'Abhishek',
        email: 'abhishek@example.com',
        passwordHash: hashedPassword,
        isEmailVerified: false,
      });

      await expect(
        authService.login({
          email: 'abhishek@example.com',
          password: 'password123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if user not found', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(
        authService.login({
          email: 'nonexistent@example.com',
          password: 'password123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException on incorrect password', async () => {
      const hashedPassword = await bcrypt.hash('correctPassword', 10);
      mockUsersService.findByEmail.mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        email: 'abhishek@example.com',
        passwordHash: hashedPassword,
        isEmailVerified: true,
      });

      await expect(
        authService.login({
          email: 'abhishek@example.com',
          password: 'wrongPassword',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('validateToken', () => {
    it('should return payload if token is valid', async () => {
      const payload = { sub: '507f1f77bcf86cd799439011', email: 'abhishek@example.com' };
      mockJwtService.verify.mockReturnValue(payload);

      const result = await authService.validateToken('valid-token');
      expect(result).toEqual(payload);
    });

    it('should return null if token verification fails', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const result = await authService.validateToken('invalid-token');
      expect(result).toBeNull();
    });
  });
});
