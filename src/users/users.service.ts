import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema.js';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async create(data: {
    name: string;
    email: string;
    passwordHash: string;
    avatar?: string;
    role?: string;
    phone?: string;
    isEmailVerified?: boolean;
    isPhoneVerified?: boolean;
    emailVerificationToken?: string;
    emailVerificationOtp?: string;
    emailVerificationExpires?: Date;
  }): Promise<UserDocument> {
    const user = new this.userModel({
      name: data.name.trim(),
      email: data.email.toLowerCase().trim(),
      passwordHash: data.passwordHash,
      avatar: data.avatar || null,
      role: data.role ? (data.role.toUpperCase() === 'TEACHER' ? 'TEACHER' : 'STUDENT') : 'STUDENT',
      phone: data.phone ? data.phone.trim() : null,
      isEmailVerified: data.isEmailVerified ?? false,
      isPhoneVerified: data.isPhoneVerified ?? false,
      emailVerificationToken: data.emailVerificationToken || null,
      emailVerificationOtp: data.emailVerificationOtp || null,
      emailVerificationExpires: data.emailVerificationExpires || null,
    });
    return user.save();
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase().trim() }).exec();
  }

  async findByPhone(phone: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ phone: phone.trim() }).exec();
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  async setVerificationData(
    userId: string,
    data: { token: string; otp: string; expires: Date },
  ): Promise<UserDocument | null> {
    return this.userModel
      .findByIdAndUpdate(
        userId,
        {
          emailVerificationToken: data.token,
          emailVerificationOtp: data.otp,
          emailVerificationExpires: data.expires,
        },
        { new: true },
      )
      .exec();
  }

  async findByVerificationToken(token: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({
        emailVerificationToken: token,
        emailVerificationExpires: { $gt: new Date() },
      })
      .exec();
  }

  async findByVerificationOtp(identifier: string, otp: string): Promise<UserDocument | null> {
    const cleanId = identifier.trim();
    return this.userModel
      .findOne({
        $or: [{ email: cleanId.toLowerCase() }, { phone: cleanId }],
        emailVerificationOtp: otp.trim(),
        emailVerificationExpires: { $gt: new Date() },
      })
      .exec();
  }

  async markEmailAsVerified(userId: string): Promise<UserDocument | null> {
    return this.userModel
      .findByIdAndUpdate(
        userId,
        {
          isEmailVerified: true,
          isPhoneVerified: true,
          emailVerificationToken: null,
          emailVerificationOtp: null,
          emailVerificationExpires: null,
        },
        { new: true },
      )
      .exec();
  }

  sanitizeUser(user: UserDocument | any) {
    if (!user) return null;
    return {
      id: user._id ? user._id.toString() : user.id,
      name: user.name,
      email: user.email,
      phone: user.phone || undefined,
      role: user.role || 'STUDENT',
      avatar: user.avatar || undefined,
      isEmailVerified: user.isEmailVerified ?? false,
      isPhoneVerified: user.isPhoneVerified ?? false,
    };
  }
}
