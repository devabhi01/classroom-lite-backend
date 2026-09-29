import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  let authService: AuthService;
  let mockUsersService: any;
  let mockJwtService: any;

  beforeEach(() => {
    mockUsersService = {
      findByEmail: vi.fn(),
      create: vi.fn(),
      findById: vi.fn(),
      sanitizeUser: vi.fn((user) => ({
        id: user._id.toString(),
        name: user.name,
        email: user.email,
      })),
    };

    mockJwtService = {
      sign: vi.fn().mockReturnValue('mock-jwt-token'),
      verify: vi.fn(),
    };

    authService = new AuthService(mockUsersService, mockJwtService);
  });

  describe('signup', () => {
    it('should successfully register a new user and return token', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        name: 'Abhishek',
        email: 'abhishek@example.com',
        passwordHash: 'hashedPassword',
      });

      const result = await authService.signup({
        name: 'Abhishek',
        email: 'abhishek@example.com',
        password: 'password123',
      });

      expect(result.success).toBe(true);
      expect(result.data.user.email).toBe('abhishek@example.com');
      expect(result.data.accessToken).toBe('mock-jwt-token');
      expect(mockUsersService.create).toHaveBeenCalled();
    });

    it('should pass role to usersService.create when provided', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        name: 'Abhishek',
        email: 'abhishek@example.com',
        role: 'TEACHER',
        passwordHash: 'hashedPassword',
      });

      const result = await authService.signup({
        name: 'Abhishek',
        email: 'abhishek@example.com',
        password: 'password123',
        role: 'TEACHER',
      });

      expect(result.success).toBe(true);
      expect(mockUsersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'TEACHER' }),
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

  describe('login', () => {
    it('should successfully authenticate user with correct password', async () => {
      const hashedPassword = await bcrypt.hash('password123', 10);
      mockUsersService.findByEmail.mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        name: 'Abhishek',
        email: 'abhishek@example.com',
        passwordHash: hashedPassword,
      });

      const result = await authService.login({
        email: 'abhishek@example.com',
        password: 'password123',
      });

      expect(result.success).toBe(true);
      expect(result.data.user.name).toBe('Abhishek');
      expect(result.data.accessToken).toBe('mock-jwt-token');
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
