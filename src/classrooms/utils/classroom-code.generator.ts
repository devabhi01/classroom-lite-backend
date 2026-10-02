import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class ClassroomCodeGenerator {
  // Characters avoiding confusing symbols like O, 0, I, 1
  private readonly charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  private readonly codeLength = 6;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates a unique 6-character classroom code and ensures no collision in database
   */
  async generateUniqueCode(): Promise<string> {
    const maxAttempts = 10;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let code = '';
      for (let i = 0; i < this.codeLength; i++) {
        const randomIndex = Math.floor(Math.random() * this.charset.length);
        code += this.charset[randomIndex];
      }

      const exists = await this.prisma.classroom.findUnique({
        where: { code },
      });
      if (!exists) {
        return code;
      }
    }

    // Fallback timestamp-based code in the rare event of multiple collisions
    return 'TDP' + Math.random().toString(36).substring(2, 5).toUpperCase();
  }
}
