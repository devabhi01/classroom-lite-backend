import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({
  timestamps: true,
  toJSON: {
    transform: (_doc, ret: Record<string, any>) => {
      delete ret.passwordHash;
      delete ret.emailVerificationToken;
      delete ret.emailVerificationOtp;
      delete ret.__v;
      return ret;
    },
  },
})
export class User extends Document {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({
    required: true,
    lowercase: true,
    trim: true,
  })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ default: 'STUDENT' })
  role?: string;

  @Prop({ default: null })
  avatar?: string;

  @Prop({ default: null, trim: true })
  phone?: string;

  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop({ default: false })
  isPhoneVerified?: boolean;

  @Prop({ default: null, index: true })
  emailVerificationToken?: string;

  @Prop({ default: null })
  emailVerificationOtp?: string;

  @Prop({ default: null })
  emailVerificationExpires?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Explicit unique index on email
UserSchema.index({ email: 1 }, { unique: true });
