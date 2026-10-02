import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import {
  UserRole,
  InstitutionRole,
  MembershipStatus,
  InstitutionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { EmailService } from '../email/email.service.js';
import { SignupDto } from './dto/signup.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';
import { ResendVerificationDto } from './dto/resend-verification.dto.js';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface.js';
import { generateInstitutionCode } from '../common/utils/generate-institution-code.util.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {}

  async signup(signupDto: SignupDto) {
    const email = signupDto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      throw new ConflictException('Email address is already registered');
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(signupDto.password, saltRounds);

    const userRole =
      signupDto.role?.toUpperCase() === 'TEACHER' ? UserRole.TEACHER : UserRole.STUDENT;

    // Generate 6-digit verification code (expires in 15 minutes)
    const verificationOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationExpires = new Date(Date.now() + 15 * 60 * 1000);

    // Execute User creation and optional Institution / Membership setups in a transaction
    const user = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          name: signupDto.name.trim(),
          email,
          passwordHash,
          avatar: signupDto.avatar || null,
          role: userRole,
          // isEmailVerified: false,
          // emailVerificationOtp: verificationOtp,
          // emailVerificationExpires: verificationExpires,
          isEmailVerified: true, // EMAIL VERIFICATION DISABLED FOR NOW: Users are auto-verified on signup
        },
      });

      // --- TEACHER FLOW (Part 9, 10, 11) ---
      if (userRole === UserRole.TEACHER) {
        if (signupDto.institutionName && signupDto.institutionName.trim()) {
          // Option 2: Teacher creates their own institution
          let code = generateInstitutionCode();
          let attempts = 0;
          while (attempts < 5) {
            const codeExists = await tx.institution.findUnique({ where: { code } });
            if (!codeExists) break;
            code = generateInstitutionCode();
            attempts++;
          }

          const institution = await tx.institution.create({
            data: {
              name: signupDto.institutionName.trim(),
              code,
              ownerId: createdUser.id,
              status: InstitutionStatus.ACTIVE,
            },
          });

          await tx.institutionMembership.create({
            data: {
              institutionId: institution.id,
              userId: createdUser.id,
              role: InstitutionRole.OWNER,
              status: MembershipStatus.ACCEPTED,
              acceptedAt: new Date(),
            },
          });

          this.logger.log(
            `Teacher ${email} created institution ${institution.name} [${code}] during signup`,
          );
        } else if (signupDto.institutionId || signupDto.institutionCode) {
          // Option 1: Teacher requests to join existing institution
          let targetInst = null;
          if (signupDto.institutionId) {
            targetInst = await tx.institution.findUnique({
              where: { id: signupDto.institutionId },
            });
          } else if (signupDto.institutionCode) {
            targetInst = await tx.institution.findUnique({
              where: { code: signupDto.institutionCode.trim().toUpperCase() },
            });
          }

          if (targetInst && targetInst.status === InstitutionStatus.ACTIVE) {
            await tx.institutionMembership.create({
              data: {
                institutionId: targetInst.id,
                userId: createdUser.id,
                role: InstitutionRole.TEACHER,
                status: MembershipStatus.REQUESTED,
              },
            });
            this.logger.log(
              `Teacher ${email} submitted join request to institution ${targetInst.name} during signup`,
            );
          }
        }
      }

      // --- STUDENT FLOW (Part 12, 13) ---
      if (userRole === UserRole.STUDENT && signupDto.institutionIds && signupDto.institutionIds.length > 0) {
        for (const instId of signupDto.institutionIds) {
          if (!instId || typeof instId !== 'string') continue;
          const inst = await tx.institution.findUnique({ where: { id: instId } });
          if (inst && inst.status === InstitutionStatus.ACTIVE) {
            await tx.institutionMembership.create({
              data: {
                institutionId: inst.id,
                userId: createdUser.id,
                role: InstitutionRole.STUDENT,
                status: MembershipStatus.REQUESTED,
              },
            });
            this.logger.log(
              `Student ${email} submitted join request to institution ${inst.name} during signup`,
            );
          }
        }
      }

      return createdUser;
    }, {
      maxWait: 15000,
      timeout: 30000,
    });

    // Send verification email with 6-digit OTP (fast-release with background completion)
    /* EMAIL VERIFICATION DISABLED FOR NOW
    Promise.race([
      this.emailService.sendVerificationOtp(
        user.email,
        user.name,
        user.emailVerificationOtp || verificationOtp,
      ),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]).catch((err) => {
      this.logger.warn(`Background email dispatch warning for ${user.email}: ${err.message}`);
    });
    */

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
    };
    const accessToken = this.jwtService.sign(payload);

    this.logger.log(`User signed up successfully: ${user.email} (${user.role}) [Auto-verified]`);

    return {
      success: true,
      message: 'Account created successfully! Welcome.',
      requiresVerification: false,
      data: {
        user: this.usersService.sanitizeUser(user),
        accessToken,
        requiresVerification: false,
      },
    };
  }

  async login(loginDto: LoginDto) {
    const email = loginDto.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(loginDto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Check if email is verified
    /* EMAIL VERIFICATION DISABLED FOR NOW
    if (!user.isEmailVerified) {
      // Generate a fresh OTP and resend
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expires = new Date(Date.now() + 15 * 60 * 1000);

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerificationOtp: otp,
          emailVerificationExpires: expires,
        },
      });

      Promise.race([
        this.emailService.sendVerificationOtp(user.email, user.name, otp),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]).catch((err) => {
        this.logger.warn(`Email delivery warning during unverified login: ${err.message}`);
      });

      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Your email address is not verified. A new 6-digit verification code has been sent to your email.',
        requiresVerification: true,
        email: user.email,
      });
    }
    */

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
    };
    const accessToken = this.jwtService.sign(payload);

    this.logger.log(`User logged in successfully: ${user.email}`);

    return {
      success: true,
      data: {
        user: this.usersService.sanitizeUser(user),
        accessToken,
      },
    };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const email = dto.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new BadRequestException('User not found with this email address');
    }

    if (user.isEmailVerified) {
      const payload: JwtPayload = { sub: user.id, email: user.email };
      const accessToken = this.jwtService.sign(payload);
      return {
        success: true,
        message: 'Email is already verified',
        data: {
          user: this.usersService.sanitizeUser(user),
          accessToken,
        },
      };
    }

    if (!user.emailVerificationOtp || user.emailVerificationOtp !== dto.otp.trim()) {
      throw new BadRequestException('Invalid 6-digit verification code');
    }

    if (user.emailVerificationExpires && user.emailVerificationExpires < new Date()) {
      throw new BadRequestException('Verification code has expired. Please request a new code.');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        emailVerificationOtp: null,
        emailVerificationExpires: null,
      },
    });

    const payload: JwtPayload = {
      sub: updatedUser.id,
      email: updatedUser.email,
    };
    const accessToken = this.jwtService.sign(payload);

    this.logger.log(`Email verified successfully for: ${updatedUser.email}`);

    return {
      success: true,
      message: 'Email verified successfully! Welcome to TDP Classroom Lite.',
      data: {
        user: this.usersService.sanitizeUser(updatedUser),
        accessToken,
      },
    };
  }

  async resendVerification(dto: ResendVerificationDto) {
    const email = dto.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new BadRequestException('User not found with this email address');
    }

    if (user.isEmailVerified) {
      throw new BadRequestException('Email address is already verified. You can sign in directly.');
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationOtp: otp,
        emailVerificationExpires: expires,
      },
    });

    Promise.race([
      this.emailService.sendVerificationOtp(user.email, user.name, otp),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]).catch((err) => {
      this.logger.warn(`Email delivery warning during resend: ${err.message}`);
    });

    return {
      success: true,
      message: 'A fresh 6-digit verification code has been sent to your email.',
    };
  }

  async validateToken(token: string): Promise<JwtPayload | null> {
    try {
      return this.jwtService.verify<JwtPayload>(token);
    } catch {
      return null;
    }
  }
}
