import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
  Inject,
  forwardRef,
  Optional,
} from '@nestjs/common';
import {
  ClassroomStatus,
  ClassroomType,
  InstitutionRole,
  MembershipStatus,
  ParticipantRole,
  ParticipantStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ClassroomCodeGenerator } from './utils/classroom-code.generator.js';
import { ClassroomGateway } from '../realtime/classroom.gateway.js';
import { UsersService } from '../users/users.service.js';
import { CreateClassroomDto } from './dto/create-classroom.dto.js';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface.js';
import { formatDuration } from '../common/utils/format-duration.util.js';

@Injectable()
export class ClassroomsService {
  private readonly logger = new Logger(ClassroomsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly codeGenerator: ClassroomCodeGenerator,
    private readonly usersService: UsersService,
    @Optional()
    @Inject(forwardRef(() => ClassroomGateway))
    private readonly classroomGateway?: ClassroomGateway,
  ) {}

  /**
   * Helper to verify classroom exists by code
   */
  async findClassroomByCode(code: string) {
    const classroom = await this.prisma.classroom.findUnique({
      where: {
        code: code.toUpperCase().trim(),
      },
      include: {
        institution: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    if (!classroom) {
      throw new NotFoundException(`Classroom with code '${code}' not found`);
    }
    return classroom;
  }

  /**
   * Helper to verify if user is host of the classroom
   */
  async verifyHost(classroom: { hostId: string }, userId: string): Promise<void> {
    if (classroom.hostId !== userId) {
      throw new ForbiddenException('Forbidden: Only the classroom host can perform this action');
    }
  }

  /**
   * 1. CREATE CLASSROOM (Independent or Institution-linked)
   */
  async createClassroom(dto: CreateClassroomDto, user: AuthenticatedUser) {
    const classroomType = dto.type || ClassroomType.INDEPENDENT;

    // Validate institution membership if creating an INSTITUTION classroom
    if (classroomType === ClassroomType.INSTITUTION) {
      if (!dto.institutionId) {
        throw new BadRequestException('institutionId is required for an INSTITUTION classroom');
      }

      const membership = await this.prisma.institutionMembership.findUnique({
        where: {
          institutionId_userId: {
            institutionId: dto.institutionId,
            userId: user.id,
          },
        },
      });

      if (
        !membership ||
        membership.status !== MembershipStatus.ACCEPTED ||
        (membership.role !== InstitutionRole.OWNER &&
          membership.role !== InstitutionRole.ADMIN &&
          membership.role !== InstitutionRole.TEACHER)
      ) {
        throw new ForbiddenException(
          'You must have an accepted teacher or admin membership in this institution to create classrooms',
        );
      }
    }

    const code = await this.codeGenerator.generateUniqueCode();

    // Use Prisma transaction: create Classroom + HOST ClassroomParticipant (Part 43)
    const result = await this.prisma.$transaction(async (tx) => {
      const classroom = await tx.classroom.create({
        data: {
          name: dto.name.trim(),
          code,
          hostId: user.id,
          type: classroomType,
          institutionId: classroomType === ClassroomType.INSTITUTION ? dto.institutionId : null,
          status: ClassroomStatus.ACTIVE,
        },
      });

      const participant = await tx.classroomParticipant.create({
        data: {
          classroomId: classroom.id,
          userId: user.id,
          role: ParticipantRole.HOST,
          status: ParticipantStatus.ACCEPTED,
          joinedAt: new Date(),
          durationSeconds: 0,
        },
      });

      return { classroom, participant };
    });

    this.logger.log(
      `Classroom created: ${result.classroom.name} [${result.classroom.code}] (${result.classroom.type}) by host ${user.email}`,
    );

    // Register initial inactivity timer on gateway
    if (this.classroomGateway) {
      this.classroomGateway.scheduleInitialInactivityTimer(result.classroom.code);
    }

    return {
      success: true,
      data: {
        id: result.classroom.id,
        name: result.classroom.name,
        code: result.classroom.code,
        hostId: result.classroom.hostId,
        type: result.classroom.type,
        institutionId: result.classroom.institutionId,
        status: result.classroom.status,
      },
    };
  }

  /**
   * 2. GET CLASSROOM
   */
  async getClassroom(code: string) {
    const classroom = await this.findClassroomByCode(code);
    const hostUser = await this.usersService.findById(classroom.hostId);

    const activePdf = classroom.activePdfFileName
      ? {
          fileName: classroom.activePdfFileName,
          fileUrl: classroom.activePdfFileUrl || '',
          totalPages: classroom.activePdfTotalPages || 1,
          currentPage: classroom.activePdfCurrentPage || 1,
        }
      : null;

    return {
      success: true,
      data: {
        id: classroom.id,
        name: classroom.name,
        code: classroom.code,
        type: classroom.type,
        institution: classroom.institution,
        host: hostUser
          ? {
              id: hostUser.id,
              name: hostUser.name,
              email: hostUser.email,
            }
          : { id: classroom.hostId },
        status: classroom.status,
        activePdf,
        createdAt: classroom.createdAt,
      },
    };
  }

  /**
   * 3. JOIN CLASSROOM (Student join request)
   */
  async joinClassroom(code: string, user: AuthenticatedUser) {
    const classroom = await this.findClassroomByCode(code);

    if (classroom.status === ClassroomStatus.ENDED) {
      throw new BadRequestException('Cannot join: This classroom has ended');
    }

    // Check if user is host
    if (classroom.hostId === user.id) {
      return {
        success: true,
        message: 'You are the host of this classroom',
        status: ParticipantStatus.ACCEPTED,
      };
    }

    // Check institution requirement (Part 33)
    if (classroom.type === ClassroomType.INSTITUTION && classroom.institutionId) {
      const institutionMembership = await this.prisma.institutionMembership.findUnique({
        where: {
          institutionId_userId: {
            institutionId: classroom.institutionId,
            userId: user.id,
          },
        },
      });

      if (!institutionMembership || institutionMembership.status !== MembershipStatus.ACCEPTED) {
        throw new ForbiddenException(
          'You must be an accepted member of this institution before requesting to join this classroom',
        );
      }
    }

    // Check existing participant record
    const existing = await this.prisma.classroomParticipant.findUnique({
      where: {
        classroomId_userId: {
          classroomId: classroom.id,
          userId: user.id,
        },
      },
    });

    let participant;
    if (existing) {
      if (existing.status === ParticipantStatus.REQUESTED) {
        throw new ConflictException('Join request already pending approval from host');
      }
      if (existing.status === ParticipantStatus.ACCEPTED) {
        return {
          success: true,
          message: 'You are already an accepted participant',
          status: ParticipantStatus.ACCEPTED,
        };
      }
      // If was REJECTED or LEFT, allow re-requesting
      participant = await this.prisma.classroomParticipant.update({
        where: { id: existing.id },
        data: {
          status: ParticipantStatus.REQUESTED,
          joinedAt: null,
          leftAt: null,
        },
      });
    } else {
      participant = await this.prisma.classroomParticipant.create({
        data: {
          classroomId: classroom.id,
          userId: user.id,
          role: ParticipantRole.STUDENT,
          status: ParticipantStatus.REQUESTED,
          durationSeconds: 0,
        },
      });
    }

    this.logger.log(`Join request submitted by ${user.email} for classroom [${classroom.code}]`);

    // Notify host via Socket.IO
    if (this.classroomGateway) {
      this.classroomGateway.notifyHostNewRequest(classroom.hostId, {
        userId: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        classroomCode: classroom.code,
        classroomId: classroom.id,
        createdAt: participant.createdAt,
      });
    }

    return {
      success: true,
      message: 'Join request sent',
      status: ParticipantStatus.REQUESTED,
    };
  }

  /**
   * 4. GET ACCEPTED PARTICIPANTS
   */
  async getParticipants(code: string) {
    const classroom = await this.findClassroomByCode(code);

    const participants = await this.prisma.classroomParticipant.findMany({
      where: {
        classroomId: classroom.id,
        status: ParticipantStatus.ACCEPTED,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatar: true },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    const data = participants.map((p) => ({
      userId: p.user.id,
      name: p.user.name,
      email: p.user.email,
      avatar: p.user.avatar,
      role: p.role,
      status: p.status,
      joinedAt: p.joinedAt,
      leftAt: p.leftAt || null,
      durationSeconds: p.durationSeconds || 0,
      durationFormatted: formatDuration(p.durationSeconds || 0),
    }));

    return {
      success: true,
      data,
    };
  }

  /**
   * 5. GET JOIN REQUESTS (Host only)
   */
  async getRequests(code: string, user: AuthenticatedUser) {
    const classroom = await this.findClassroomByCode(code);
    await this.verifyHost(classroom, user.id);

    const requests = await this.prisma.classroomParticipant.findMany({
      where: {
        classroomId: classroom.id,
        status: ParticipantStatus.REQUESTED,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatar: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const data = requests.map((r) => ({
      userId: r.user.id,
      name: r.user.name,
      email: r.user.email,
      avatar: r.user.avatar,
      status: r.status,
      createdAt: r.createdAt,
    }));

    return {
      success: true,
      data,
    };
  }

  /**
   * 6. ACCEPT JOIN REQUEST (Host only)
   */
  async acceptRequest(code: string, targetUserId: string, user: AuthenticatedUser) {
    const classroom = await this.findClassroomByCode(code);
    await this.verifyHost(classroom, user.id);

    const participant = await this.prisma.classroomParticipant.findUnique({
      where: {
        classroomId_userId: {
          classroomId: classroom.id,
          userId: targetUserId,
        },
      },
    });

    if (!participant) {
      throw new NotFoundException('Join request not found for this user');
    }

    if (participant.status !== ParticipantStatus.REQUESTED) {
      throw new BadRequestException(`Participant is not in REQUESTED status (currently: ${participant.status})`);
    }

    const now = new Date();
    await this.prisma.classroomParticipant.update({
      where: { id: participant.id },
      data: {
        status: ParticipantStatus.ACCEPTED,
        joinedAt: now,
        leftAt: null,
      },
    });

    this.logger.log(`Request accepted for user ${targetUserId} in classroom [${code}]`);

    // Notify specific student
    if (this.classroomGateway) {
      this.classroomGateway.notifyStudentAccepted(targetUserId, {
        classroomCode: classroom.code,
        classroomId: classroom.id,
        status: ParticipantStatus.ACCEPTED,
        message: 'Your join request was accepted by the host',
      });

      // Broadcast updated participant list to classroom room
      const updatedUser = await this.usersService.findById(targetUserId);
      this.classroomGateway.broadcastToClassroom(classroom.code, 'classroom:participant-updated', {
        userId: targetUserId,
        name: updatedUser?.name || 'Student',
        email: updatedUser?.email || '',
        role: participant.role,
        status: ParticipantStatus.ACCEPTED,
        joinedAt: now,
      });
    }

    return {
      success: true,
      message: 'Join request accepted',
      data: {
        userId: targetUserId,
        status: ParticipantStatus.ACCEPTED,
      },
    };
  }

  /**
   * 7. REJECT JOIN REQUEST (Host only)
   */
  async rejectRequest(code: string, targetUserId: string, user: AuthenticatedUser) {
    const classroom = await this.findClassroomByCode(code);
    await this.verifyHost(classroom, user.id);

    const participant = await this.prisma.classroomParticipant.findUnique({
      where: {
        classroomId_userId: {
          classroomId: classroom.id,
          userId: targetUserId,
        },
      },
    });

    if (!participant) {
      throw new NotFoundException('Join request not found for this user');
    }

    await this.prisma.classroomParticipant.update({
      where: { id: participant.id },
      data: {
        status: ParticipantStatus.REJECTED,
      },
    });

    this.logger.log(`Request rejected for user ${targetUserId} in classroom [${code}]`);

    // Notify student
    if (this.classroomGateway) {
      this.classroomGateway.notifyStudentRejected(targetUserId, {
        classroomCode: classroom.code,
        classroomId: classroom.id,
        status: ParticipantStatus.REJECTED,
        message: 'Your join request was rejected by the host',
      });
    }

    return {
      success: true,
      message: 'Join request rejected',
      data: {
        userId: targetUserId,
        status: ParticipantStatus.REJECTED,
      },
    };
  }

  /**
   * 8. LEAVE CLASSROOM
   */
  async leaveClassroom(code: string, user: AuthenticatedUser) {
    const classroom = await this.findClassroomByCode(code);

    const participant = await this.prisma.classroomParticipant.findUnique({
      where: {
        classroomId_userId: {
          classroomId: classroom.id,
          userId: user.id,
        },
      },
    });

    if (!participant) {
      throw new NotFoundException('Participant record not found in this classroom');
    }

    const now = new Date();
    let durationSeconds = participant.durationSeconds || 0;
    if (participant.joinedAt) {
      const sessionSeconds = Math.max(
        0,
        Math.round((now.getTime() - new Date(participant.joinedAt).getTime()) / 1000),
      );
      durationSeconds += sessionSeconds;
    }

    await this.prisma.classroomParticipant.update({
      where: { id: participant.id },
      data: {
        status: ParticipantStatus.LEFT,
        leftAt: now,
        durationSeconds,
      },
    });

    this.logger.log(`User ${user.email} left classroom [${code}] (Duration: ${durationSeconds}s)`);

    // Broadcast user-left to classroom
    if (this.classroomGateway) {
      this.classroomGateway.broadcastToClassroom(classroom.code, 'classroom:user-left', {
        userId: user.id,
        name: user.name,
        durationSeconds,
        durationFormatted: formatDuration(durationSeconds),
      });
    }

    return {
      success: true,
      message: 'Left classroom successfully',
      data: {
        durationSeconds,
        durationFormatted: formatDuration(durationSeconds),
      },
    };
  }

  /**
   * 9. END CLASSROOM (Host only)
   */
  async endClassroom(code: string, user: AuthenticatedUser) {
    const classroom = await this.findClassroomByCode(code);
    await this.verifyHost(classroom, user.id);

    if (classroom.status === ClassroomStatus.ENDED) {
      throw new BadRequestException('Classroom is already ended');
    }

    const now = new Date();
    await this.prisma.classroom.update({
      where: { id: classroom.id },
      data: {
        status: ClassroomStatus.ENDED,
        endedAt: now,
      },
    });

    // Finalize all active participants' duration
    await this.finalizeActiveParticipantsDuration(classroom.id, now);

    this.logger.log(`Classroom [${code}] ended by host ${user.email}`);

    // Broadcast classroom:ended
    if (this.classroomGateway) {
      this.classroomGateway.broadcastToClassroom(classroom.code, 'classroom:ended', {
        classroomCode: classroom.code,
        endedAt: now,
        reason: 'HOST_ENDED',
        message: 'The host has ended this classroom session',
      });
    }

    return {
      success: true,
      message: 'Classroom ended successfully',
    };
  }

  /**
   * 10. AUTO-END CLASSROOM DUE TO INACTIVITY
   */
  async autoEndClassroomDueToInactivity(code: string) {
    const classroom = await this.prisma.classroom.findUnique({
      where: { code: code.toUpperCase().trim() },
    });

    if (!classroom || classroom.status === ClassroomStatus.ENDED) {
      return;
    }

    const now = new Date();
    await this.prisma.classroom.update({
      where: { id: classroom.id },
      data: {
        status: ClassroomStatus.ENDED,
        endedAt: now,
      },
    });

    await this.finalizeActiveParticipantsDuration(classroom.id, now);

    this.logger.log(
      `Classroom [${code}] automatically ended due to inactivity (no participants connected).`,
    );

    if (this.classroomGateway) {
      this.classroomGateway.broadcastToClassroom(classroom.code, 'classroom:ended', {
        classroomCode: classroom.code,
        endedAt: now,
        reason: 'INACTIVITY',
        message: 'Classroom was automatically closed due to inactivity',
      });
    }
  }

  /**
   * Helper to finalize duration for active participants when class ends
   */
  private async finalizeActiveParticipantsDuration(classroomId: string, endedAt: Date) {
    const participants = await this.prisma.classroomParticipant.findMany({
      where: {
        classroomId,
        status: { in: [ParticipantStatus.ACCEPTED, ParticipantStatus.LEFT] },
      },
    });

    for (const p of participants) {
      if (!p.leftAt && p.joinedAt) {
        const sessionSeconds = Math.max(
          0,
          Math.round((endedAt.getTime() - new Date(p.joinedAt).getTime()) / 1000),
        );
        const durationSeconds = (p.durationSeconds || 0) + sessionSeconds;
        await this.prisma.classroomParticipant.update({
          where: { id: p.id },
          data: {
            leftAt: endedAt,
            durationSeconds,
          },
        });
      }
    }
  }

  /**
   * 11. TEACHER DASHBOARD HISTORY
   */
  async getTeacherHistory(userId: string) {
    const classrooms = await this.prisma.classroom.findMany({
      where: { hostId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        institution: { select: { id: true, name: true, code: true } },
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true, avatar: true } },
          },
        },
      },
    });

    const history = classrooms.map((c) => {
      const formattedParticipants = c.participants.map((p) => ({
        userId: p.user.id,
        name: p.user.name,
        email: p.user.email,
        avatar: p.user.avatar,
        role: p.role,
        status: p.status,
        joinedAt: p.joinedAt,
        leftAt: p.leftAt || null,
        durationSeconds: p.durationSeconds || 0,
        durationFormatted: formatDuration(p.durationSeconds || 0),
      }));

      let totalClassDurationSeconds = 0;
      if (c.endedAt) {
        totalClassDurationSeconds = Math.max(
          0,
          Math.round((c.endedAt.getTime() - c.createdAt.getTime()) / 1000),
        );
      } else if (c.status === ClassroomStatus.ACTIVE) {
        totalClassDurationSeconds = Math.max(
          0,
          Math.round((Date.now() - c.createdAt.getTime()) / 1000),
        );
      }

      return {
        id: c.id,
        name: c.name,
        code: c.code,
        type: c.type,
        institution: c.institution,
        status: c.status,
        createdAt: c.createdAt,
        endedAt: c.endedAt || null,
        totalClassDurationSeconds,
        totalClassDurationFormatted: formatDuration(totalClassDurationSeconds),
        totalParticipantsCount: formattedParticipants.length,
        participants: formattedParticipants,
      };
    });

    return {
      success: true,
      data: history,
    };
  }

  /**
   * 12. STUDENT DASHBOARD HISTORY
   */
  async getStudentHistory(userId: string) {
    const studentRecords = await this.prisma.classroomParticipant.findMany({
      where: {
        userId,
        role: ParticipantRole.STUDENT,
        status: { in: [ParticipantStatus.ACCEPTED, ParticipantStatus.LEFT] },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        classroom: {
          include: {
            host: { select: { id: true, name: true, email: true } },
            institution: { select: { id: true, name: true, code: true } },
            participants: {
              where: {
                role: ParticipantRole.STUDENT,
                status: { in: [ParticipantStatus.ACCEPTED, ParticipantStatus.LEFT] },
              },
              select: { id: true },
            },
          },
        },
      },
    });

    const history = studentRecords.map((record) => {
      const c = record.classroom;
      let totalClassDurationSeconds = 0;
      if (c.endedAt) {
        totalClassDurationSeconds = Math.max(
          0,
          Math.round((c.endedAt.getTime() - c.createdAt.getTime()) / 1000),
        );
      }

      return {
        classroomId: c.id,
        name: c.name,
        code: c.code,
        type: c.type,
        institution: c.institution,
        status: c.status,
        createdAt: c.createdAt,
        endedAt: c.endedAt || null,
        totalClassDurationSeconds,
        totalClassDurationFormatted: formatDuration(totalClassDurationSeconds),
        host: c.host,
        myAttendance: {
          joinedAt: record.joinedAt || null,
          leftAt: record.leftAt || null,
          durationSeconds: record.durationSeconds || 0,
          durationFormatted: formatDuration(record.durationSeconds || 0),
        },
        totalClassmatesCount: Math.max(0, c.participants.length - 1),
      };
    });

    return {
      success: true,
      data: history,
    };
  }

  /**
   * 13. SPECIFIC CLASSROOM DETAILED REPORT / HISTORY
   */
  async getClassroomHistory(code: string, user: AuthenticatedUser) {
    const classroom = await this.findClassroomByCode(code);

    const isHost = classroom.hostId === user.id;
    const participant = await this.prisma.classroomParticipant.findUnique({
      where: {
        classroomId_userId: {
          classroomId: classroom.id,
          userId: user.id,
        },
      },
    });

    if (!isHost && !participant) {
      throw new ForbiddenException('Forbidden: You were not part of this classroom');
    }

    const participants = await this.prisma.classroomParticipant.findMany({
      where: { classroomId: classroom.id },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
      },
    });

    const formattedParticipants = participants.map((p) => ({
      userId: p.user.id,
      name: p.user.name,
      email: p.user.email,
      avatar: p.user.avatar,
      role: p.role,
      status: p.status,
      joinedAt: p.joinedAt,
      leftAt: p.leftAt || null,
      durationSeconds: p.durationSeconds || 0,
      durationFormatted: formatDuration(p.durationSeconds || 0),
    }));

    let totalClassDurationSeconds = 0;
    if (classroom.endedAt) {
      totalClassDurationSeconds = Math.max(
        0,
        Math.round((classroom.endedAt.getTime() - classroom.createdAt.getTime()) / 1000),
      );
    }

    return {
      success: true,
      data: {
        id: classroom.id,
        name: classroom.name,
        code: classroom.code,
        type: classroom.type,
        institution: classroom.institution,
        status: classroom.status,
        createdAt: classroom.createdAt,
        endedAt: classroom.endedAt || null,
        totalClassDurationSeconds,
        totalClassDurationFormatted: formatDuration(totalClassDurationSeconds),
        totalParticipantsCount: formattedParticipants.length,
        participants: formattedParticipants,
      },
    };
  }

  /**
   * 14. GET RECENT CLASSROOMS (Dashboard & Recent Classrooms)
   * Returns classrooms with live active status, reconciling stale sessions
   */
  async getRecentClassrooms(user: AuthenticatedUser) {
    const isTeacher = user.role === UserRole.TEACHER || (user as any).role === 'HOST';

    if (isTeacher) {
      // 1. Auto-reconcile stale active classrooms for this host (>2 hours with 0 active users)
      try {
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        const staleActive = await this.prisma.classroom.findMany({
          where: {
            hostId: user.id,
            status: ClassroomStatus.ACTIVE,
            createdAt: { lt: twoHoursAgo },
          },
        });

        for (const room of staleActive) {
          if (this.classroomGateway && !this.classroomGateway.isClassroomActive(room.code)) {
            await this.prisma.classroom.update({
              where: { id: room.id },
              data: {
                status: ClassroomStatus.ENDED,
                endedAt: new Date(),
              },
            });
            this.logger.log(`Auto-ended stale classroom [${room.code}] for host ${user.email}`);
          }
        }
      } catch {
        // Non-blocking
      }

      const classrooms = await this.prisma.classroom.findMany({
        where: { hostId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: {
          institution: { select: { id: true, name: true, code: true } },
          _count: {
            select: {
              participants: {
                where: { status: { in: [ParticipantStatus.ACCEPTED, ParticipantStatus.LEFT] } },
              },
            },
          },
        },
      });

      return {
        success: true,
        data: classrooms.map((c) => ({
          id: c.id,
          name: c.name,
          code: c.code,
          type: c.type,
          institution: c.institution,
          status: c.status,
          hostId: c.hostId,
          createdAt: c.createdAt,
          endedAt: c.endedAt,
          participantCount: c._count.participants,
        })),
      };
    } else {
      // Student: classrooms attended or accepted to
      const attended = await this.prisma.classroomParticipant.findMany({
        where: {
          userId: user.id,
          status: { in: [ParticipantStatus.ACCEPTED, ParticipantStatus.LEFT] },
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: {
          classroom: {
            include: {
              host: { select: { id: true, name: true, email: true } },
              institution: { select: { id: true, name: true, code: true } },
              _count: {
                select: {
                  participants: {
                    where: { status: { in: [ParticipantStatus.ACCEPTED, ParticipantStatus.LEFT] } },
                  },
                },
              },
            },
          },
        },
      });

      // Also get active institutional classrooms for student's institutions
      const memberships = await this.prisma.institutionMembership.findMany({
        where: {
          userId: user.id,
          status: MembershipStatus.ACCEPTED,
        },
        select: { institutionId: true },
      });
      const instIds = memberships.map((m) => m.institutionId);

      let instRooms: any[] = [];
      if (instIds.length > 0) {
        instRooms = await this.prisma.classroom.findMany({
          where: {
            institutionId: { in: instIds },
            status: ClassroomStatus.ACTIVE,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            host: { select: { id: true, name: true, email: true } },
            institution: { select: { id: true, name: true, code: true } },
            _count: {
              select: {
                participants: {
                  where: { status: { in: [ParticipantStatus.ACCEPTED, ParticipantStatus.LEFT] } },
                },
              },
            },
          },
        });
      }

      const seen = new Set<string>();
      const result = [];

      for (const a of attended) {
        if (a.classroom && !seen.has(a.classroom.id)) {
          seen.add(a.classroom.id);
          result.push({
            id: a.classroom.id,
            name: a.classroom.name,
            code: a.classroom.code,
            type: a.classroom.type,
            institution: a.classroom.institution,
            status: a.classroom.status,
            hostId: a.classroom.hostId,
            host: a.classroom.host,
            createdAt: a.classroom.createdAt,
            endedAt: a.classroom.endedAt,
            participantCount: a.classroom._count.participants,
          });
        }
      }

      for (const r of instRooms) {
        if (!seen.has(r.id)) {
          seen.add(r.id);
          result.push({
            id: r.id,
            name: r.name,
            code: r.code,
            type: r.type,
            institution: r.institution,
            status: r.status,
            hostId: r.hostId,
            host: r.host,
            createdAt: r.createdAt,
            endedAt: r.endedAt,
            participantCount: r._count.participants,
          });
        }
      }

      return {
        success: true,
        data: result,
      };
    }
  }
}
