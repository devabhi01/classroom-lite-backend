import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service.js';
import { MailService } from '../mail/mail.service.js';
import { SmsService } from '../sms/sms.service.js';
import { SignupDto } from './dto/signup.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';
import { ResendVerificationDto } from './dto/resend-verification.dto.js';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly smsService: SmsService,
  ) {}

  async signup(signupDto: SignupDto) {
    const existing = await this.usersService.findByEmail(signupDto.email);
    if (existing) {
      throw new ConflictException('Email address is already registered');
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(signupDto.password, saltRounds);

    const userRole = signupDto.role?.toUpperCase() === 'TEACHER' ? 'TEACHER' : 'STUDENT';

    // Generate verification token and 6-digit OTP code (24-hour expiration)
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');
    const emailVerificationOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = await this.usersService.create({
      name: signupDto.name,
      email: signupDto.email,
      passwordHash,
      avatar: signupDto.avatar,
      role: userRole,
      phone: signupDto.phone,
      isEmailVerified: false,
      isPhoneVerified: false,
      emailVerificationToken,
      emailVerificationOtp,
      emailVerificationExpires,
    });

    // Send confirmation email
    await this.mailService.sendVerificationEmail(
      user.email,
      user.name,
      emailVerificationToken,
      emailVerificationOtp,
    );

    // Send SMS OTP if phone number is provided
    if (signupDto.phone) {
      await this.smsService.sendOtp(
        signupDto.phone,
        emailVerificationOtp,
        user.name,
      );
    }

    this.logger.log(`User signed up (verification pending): ${user.email}`);

    return {
      success: true,
      message: signupDto.phone
        ? 'Account created! Confirmation OTP sent to your email and phone.'
        : 'Account created! Please check your email to verify your account.',
      data: {
        requiresVerification: true,
        email: user.email,
        phone: user.phone || undefined,
        user: this.usersService.sanitizeUser(user),
      },
    };
  }

  async verifyEmail(verifyEmailDto: VerifyEmailDto) {
    let user = null;

    if (verifyEmailDto.token) {
      user = await this.usersService.findByVerificationToken(verifyEmailDto.token.trim());
    } else if (verifyEmailDto.code && (verifyEmailDto.email || verifyEmailDto.phone)) {
      const identifier = (verifyEmailDto.email || verifyEmailDto.phone)!.trim();
      user = await this.usersService.findByVerificationOtp(
        identifier,
        verifyEmailDto.code.trim(),
      );
    } else {
      throw new BadRequestException('Please provide a verification token or 6-digit code with email or phone.');
    }

    if (!user) {
      throw new BadRequestException('Invalid or expired verification code/link. Please request a new one.');
    }

    const verifiedUser = await this.usersService.markEmailAsVerified(user._id.toString());
    const payload: JwtPayload = {
      sub: user._id.toString(),
      email: user.email,
    };
    const accessToken = this.jwtService.sign(payload);

    this.logger.log(`Verification confirmed successfully for: ${user.email}`);

    return {
      success: true,
      message: 'Account verified successfully! Welcome to TDP Classroom Lite.',
      data: {
        user: this.usersService.sanitizeUser(verifiedUser || user),
        accessToken,
      },
    };
  }

  async resendVerification(resendDto: ResendVerificationDto) {
    let user = null;
    if (resendDto.email) {
      user = await this.usersService.findByEmail(resendDto.email);
    } else if (resendDto.phone) {
      user = await this.usersService.findByPhone(resendDto.phone);
    }

    if (!user) {
      // Return success to avoid email/phone enumeration
      return {
        success: true,
        message: 'If an account exists with this credential, a verification OTP has been sent.',
      };
    }

    if (user.isEmailVerified && user.isPhoneVerified) {
      return {
        success: true,
        message: 'Your account is already verified. You can log in directly.',
      };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.usersService.setVerificationData(user._id.toString(), {
      token,
      otp,
      expires,
    });

    if (user.email) {
      await this.mailService.sendVerificationEmail(user.email, user.name, token, otp);
    }
    if (user.phone) {
      await this.smsService.sendOtp(user.phone, otp, user.name);
    }

    return {
      success: true,
      message: user.phone
        ? 'Verification code resent to your email and phone!'
        : 'Verification code resent to your email!',
    };
  }

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmail(loginDto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(loginDto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Require email/phone verification (explicit false check preserves legacy test data)
    if (user.isEmailVerified === false) {
      throw new UnauthorizedException({
        message: 'Please verify your email/phone before logging in. We sent an OTP to your inbox and phone.',
        requiresVerification: true,
        email: user.email,
        phone: user.phone || undefined,
      });
    }

    const payload: JwtPayload = {
      sub: user._id.toString(),
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

  async validateToken(token: string): Promise<JwtPayload | null> {
    try {
      return this.jwtService.verify<JwtPayload>(token);
    } catch {
      return null;
    }
  }
}
