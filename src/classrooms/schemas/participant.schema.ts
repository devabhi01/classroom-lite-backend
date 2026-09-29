import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument, Types } from 'mongoose';
import { ParticipantRole } from '../../common/constants/roles.enum.js';
import { ParticipantStatus } from '../../common/constants/statuses.enum.js';

export type ParticipantDocument = HydratedDocument<Participant>;

@Schema({
  timestamps: true,
  toJSON: {
    transform: (_doc, ret: Record<string, any>) => {
      ret.id = ret._id ? ret._id.toString() : ret.id;
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  },
})
export class Participant extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Classroom', required: true })
  classroomId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(ParticipantRole),
    required: true,
  })
  role: ParticipantRole;

  @Prop({
    type: String,
    enum: Object.values(ParticipantStatus),
    required: true,
    default: ParticipantStatus.REQUESTED,
  })
  status: ParticipantStatus;

  @Prop({ type: Date, default: null })
  joinedAt?: Date | null;

  @Prop({ type: Date, default: null })
  leftAt?: Date | null;

  @Prop({ type: Number, default: 0 })
  durationSeconds?: number;

  createdAt: Date;
  updatedAt: Date;
}

export const ParticipantSchema = SchemaFactory.createForClass(Participant);

// Explicit schema indexes (single source of truth)
ParticipantSchema.index({ classroomId: 1 });
ParticipantSchema.index({ userId: 1 });
ParticipantSchema.index({ classroomId: 1, userId: 1 }, { unique: true });
