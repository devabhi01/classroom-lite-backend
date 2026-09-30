import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { UserRole, type User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    name: string;
    email: string;
    passwordHash: string;
    avatar?: string | null;
    role?: UserRole;
  }): Promise<User> {
    return this.prisma.user.create({
      data: {
        name: data.name.trim(),
        email: data.email.toLowerCase().trim(),
        passwordHash: data.passwordHash,
        avatar: data.avatar || null,
        role: data.role || UserRole.STUDENT,
      },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  sanitizeUser(user: any) {
    if (!user) return null;
    return {
      id: user.id || (user._id ? user._id.toString() : undefined),
      name: user.name,
      email: user.email,
      role: user.role || undefined,
      avatar: user.avatar || undefined,
      isEmailVerified: !!user.isEmailVerified,
      createdAt: user.createdAt,
    };
  }

  /**
   * Delete current user account
   * If user owns any institutions, blocks deletion until institutions are deleted or transferred.
   */
  async deleteAccount(userId: string): Promise<{ success: boolean; message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        ownedInstitutions: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User account not found');
    }

    // Institution owners cannot delete account without deleting or transferring ownership
    if (user.ownedInstitutions && user.ownedInstitutions.length > 0) {
      const instNames = user.ownedInstitutions.map((i) => `"${i.name}"`).join(', ');
      throw new BadRequestException(
        `You own institution(s) ${instNames}. Before deleting your account, you must either delete your institution or transfer its ownership to another teacher.`,
      );
    }

    // Execute deletion in a transaction
    await this.prisma.$transaction(async (tx) => {
      // 1. Delete classroom participants
      await tx.classroomParticipant.deleteMany({
        where: { userId },
      });

      // 2. Delete institution memberships
      await tx.institutionMembership.deleteMany({
        where: { userId },
      });

      // 3. Delete hosted classrooms
      await tx.classroom.deleteMany({
        where: { hostId: userId },
      });

      // 4. Delete whiteboard operations
      await tx.whiteboardOperation.deleteMany({
        where: { userId },
      });

      // 5. Delete user record
      await tx.user.delete({
        where: { id: userId },
      });
    });

    this.logger.log(`User ${user.email} (${userId}) deleted their account`);

    return {
      success: true,
      message: 'Your account has been deleted successfully',
    };
  }
}
