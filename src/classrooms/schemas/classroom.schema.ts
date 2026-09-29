import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument, Types } from 'mongoose';
import { ClassroomStatus, ClassroomEndedReason } from '../../common/constants/statuses.enum.js';

export type ClassroomDocument = HydratedDocument<Classroom>;

@Schema({ _id: false })
export class ActivePdf {
  @Prop({ required: true })
  fileName: string;

  @Prop({ required: false, default: '' })
  fileUrl: string;

  @Prop({ required: true, min: 1 })
  totalPages: number;

  @Prop({ required: true, default: 1, min: 1 })
  currentPage: number;
}

export const ActivePdfSchema = SchemaFactory.createForClass(ActivePdf);

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
export class Classroom extends Document {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, uppercase: true, trim: true })
  code: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  hostId: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(ClassroomStatus),
    default: ClassroomStatus.ACTIVE,
  })
  status: ClassroomStatus;

  @Prop({ type: ActivePdfSchema, default: null })
  activePdf?: ActivePdf | null;

  @Prop({ type: Date, default: null })
  endedAt?: Date | null;

  @Prop({
    type: String,
    enum: Object.values(ClassroomEndedReason),
    default: null,
  })
  endedReason?: ClassroomEndedReason | string | null;

  createdAt: Date;
  updatedAt: Date;
}

export const ClassroomSchema = SchemaFactory.createForClass(Classroom);

// Explicit schema indexes (single source of truth)
ClassroomSchema.index({ code: 1 }, { unique: true });
ClassroomSchema.index({ hostId: 1 });
ClassroomSchema.index({ status: 1 });
