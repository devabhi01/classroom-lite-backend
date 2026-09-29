import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  WhiteboardOperation,
  WhiteboardOperationSchema,
} from './schemas/whiteboard-operation.schema.js';
import { WhiteboardService } from './whiteboard.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WhiteboardOperation.name, schema: WhiteboardOperationSchema },
    ]),
  ],
  providers: [WhiteboardService],
  exports: [WhiteboardService, MongooseModule],
})
export class WhiteboardModule {}
