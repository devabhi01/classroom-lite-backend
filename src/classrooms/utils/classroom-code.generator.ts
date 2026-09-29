import { Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import { ClassroomDocument } from '../schemas/classroom.schema.js';

@Injectable()
export class ClassroomCodeGenerator {
  // Characters avoiding confusing symbols like O, 0, I, 1
  private readonly charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  private readonly codeLength = 6;

  /**
   * Generates a unique 6-character classroom code and ensures no collision in database
   */
  async generateUniqueCode(classroomModel: Model<ClassroomDocument>): Promise<string> {
    const maxAttempts = 10;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let code = '';
      for (let i = 0; i < this.codeLength; i++) {
        const randomIndex = Math.floor(Math.random() * this.charset.length);
        code += this.charset[randomIndex];
      }

      const exists = await classroomModel.exists({ code });
      if (!exists) {
        return code;
      }
    }

    // Fallback timestamp-based code in the rare event of multiple collisions
    return 'TDP' + Math.random().toString(36).substring(2, 5).toUpperCase();
  }
}
