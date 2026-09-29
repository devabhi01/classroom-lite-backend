import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument, Types } from 'mongoose';
import { WhiteboardOperationType } from '../../common/constants/statuses.enum.js';

export type WhiteboardOperationDocument = HydratedDocument<WhiteboardOperation>;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  toJSON: {
    transform: (_doc, ret: Record<string, any>) => {
      ret.id = ret._id ? ret._id.toString() : ret.id;
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  },
})
export class WhiteboardOperation extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Classroom', required: true })
  classroomId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(WhiteboardOperationType),
    required: true,
  })
  type: WhiteboardOperationType;

  @Prop({ required: true, type: Number })
  x1: number;

  @Prop({ required: true, type: Number })
  y1: number;

  @Prop({ required: true, type: Number })
  x2: number;

  @Prop({ required: true, type: Number })
  y2: number;

  @Prop({ type: String, default: '#000000' })
  color?: string;

  @Prop({ required: true, type: Number, min: 1 })
  width: number;

  createdAt: Date;
}

export const WhiteboardOperationSchema = SchemaFactory.createForClass(WhiteboardOperation);

// Explicit schema indexes (single source of truth)
WhiteboardOperationSchema.index({ classroomId: 1 });
WhiteboardOperationSchema.index({ classroomId: 1, createdAt: 1 });
