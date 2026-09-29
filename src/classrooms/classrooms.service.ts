import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Classroom, ClassroomDocument } from './schemas/classroom.schema.js';
import { Participant, ParticipantDocument } from './schemas/participant.schema.js';
import { ClassroomCodeGenerator } from './utils/classroom-code.generator.js';
import { ClassroomGateway } from '../realtime/classroom.gateway.js';
import { UsersService } from '../users/users.service.js';
import { CreateClassroomDto } from './dto/create-classroom.dto.js';
import {
  ClassroomStatus,
  ClassroomEndedReason,
  ParticipantStatus,
} from '../common/constants/statuses.enum.js';
import { ParticipantRole } from '../common/constants/roles.enum.js';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface.js';
import { formatDuration } from '../common/utils/format-duration.util.js';

@Injectable()
export class ClassroomsService {
  private readonly logger = new Logger(ClassroomsService.name);

  constructor(
    @InjectModel(Classroom.name)
    private readonly classroomModel: Model<ClassroomDocument>,
    @InjectModel(Participant.name)
    private readonly participantModel: Model<ParticipantDocument>,
    private readonly codeGenerator: ClassroomCodeGenerator,
    private readonly usersService: UsersService,
    private readonly classroomGateway: ClassroomGateway,
  ) {}

  /**
   * Helper to verify classroom exists by code
   */
  async findClassroomByCode(code: string): Promise<ClassroomDocument> {
    const classroom = await this.classroomModel.findOne({
      code: code.toUpperCase().trim(),
    });
    if (!classroom) {
      throw new NotFoundException(`Classroom with code '${code}' not found`);
    }
    return classroom;
  }

  /**
   * Helper to verify if user is host of the classroom
   */
  async verifyHost(classroom: ClassroomDocument, userId: string): Promise<void> {
    if (classroom.hostId.toString() !== userId) {
      throw new ForbiddenException('Forbidden: Only the classroom host can perform this action');
    }
  }

  /**
   * 1. CREATE CLASSROOM
   */
  async createClassroom(dto: CreateClassroomDto, user: AuthenticatedUser) {
    const code = await this.codeGenerator.generateUniqueCode(this.classroomModel);

    const classroom = new this.classroomModel({
      name: dto.name.trim(),
      code,
      hostId: new Types.ObjectId(user.id),
      status: ClassroomStatus.ACTIVE,
      activePdf: null,
      endedReason: null,
    });
    await classroom.save();

    // Create participant entry for host
    const participant = new this.participantModel({
      classroomId: classroom._id,
      userId: new Types.ObjectId(user.id),
      role: ParticipantRole.HOST,
      status: ParticipantStatus.ACCEPTED,
      joinedAt: new Date(),
      leftAt: null,
      durationSeconds: 0,
    });
    await participant.save();

    this.logger.log(`Classroom created: ${classroom.name} [${classroom.code}] by host ${user.email}`);

    // Register initial inactivity timer on gateway (e.g., if host does not connect within 5 minutes)
    this.classroomGateway.scheduleInitialInactivityTimer(classroom.code);

    return {
      success: true,
      data: {
        id: classroom._id.toString(),
        name: classroom.name,
        code: classroom.code,
        hostId: classroom.hostId.toString(),
        status: classroom.status,
      },
    };
  }

  /**
   * 2. GET CLASSROOM
   */
  async getClassroom(code: string) {
    const classroom = await this.findClassroomByCode(code);
    const hostUser = await this.usersService.findById(classroom.hostId.toString());

    return {
      success: true,
      data: {
        id: classroom._id.toString(),
        name: classroom.name,
        code: classroom.code,
        host: hostUser
          ? {
              id: hostUser._id.toString(),
              name: hostUser.name,
              email: hostUser.email,
            }
          : { id: classroom.hostId.toString() },
        status: classroom.status,
        activePdf: classroom.activePdf || null,
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
    if (classroom.hostId.toString() === user.id) {
      return {
        success: true,
        message: 'You are the host of this classroom',
        status: ParticipantStatus.ACCEPTED,
      };
    }

    // Check existing participant record
    let participant = await this.participantModel.findOne({
      classroomId: classroom._id,
      userId: new Types.ObjectId(user.id),
    });

    if (participant) {
      if (participant.status === ParticipantStatus.REQUESTED) {
        throw new ConflictException('Join request already pending approval from host');
      }
      if (participant.status === ParticipantStatus.ACCEPTED) {
        return {
          success: true,
          message: 'You are already an accepted participant',
          status: ParticipantStatus.ACCEPTED,
        };
      }
      // If was REJECTED or LEFT, allow re-requesting
      participant.status = ParticipantStatus.REQUESTED;
      participant.joinedAt = null;
      participant.leftAt = null;
      await participant.save();
    } else {
      participant = new this.participantModel({
        classroomId: classroom._id,
        userId: new Types.ObjectId(user.id),
        role: ParticipantRole.STUDENT,
        status: ParticipantStatus.REQUESTED,
        joinedAt: null,
        leftAt: null,
        durationSeconds: 0,
      });
      await participant.save();
    }

    this.logger.log(`Join request submitted by ${user.email} for classroom [${classroom.code}]`);

    // Notify host via Socket.IO
    this.classroomGateway.notifyHostNewRequest(classroom.hostId.toString(), {
      userId: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      classroomCode: classroom.code,
      classroomId: classroom._id.toString(),
      createdAt: participant.createdAt,
    });

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

    const participants = await this.participantModel
      .find({
        classroomId: classroom._id,
        status: ParticipantStatus.ACCEPTED,
      })
      .populate('userId', 'name email avatar')
      .exec();

    const data = participants.map((p) => {
      const u = p.userId as any;
      return {
        userId: u?._id ? u._id.toString() : p.userId.toString(),
        name: u?.name || 'Unknown',
        email: u?.email || '',
        avatar: u?.avatar || null,
        role: p.role,
        status: p.status,
        joinedAt: p.joinedAt,
        leftAt: p.leftAt || null,
        durationSeconds: p.durationSeconds || 0,
        durationFormatted: formatDuration(p.durationSeconds || 0),
      };
    });

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

    const requests = await this.participantModel
      .find({
        classroomId: classroom._id,
        status: ParticipantStatus.REQUESTED,
      })
      .populate('userId', 'name email avatar')
      .exec();

    const data = requests.map((r) => {
      const u = r.userId as any;
      return {
        userId: u?._id ? u._id.toString() : r.userId.toString(),
        name: u?.name || 'Unknown',
        email: u?.email || '',
        avatar: u?.avatar || null,
        status: r.status,
        createdAt: r.createdAt,
      };
    });

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

    const participant = await this.participantModel.findOne({
      classroomId: classroom._id,
      userId: new Types.ObjectId(targetUserId),
    });

    if (!participant) {
      throw new NotFoundException('Join request not found for this user');
    }

    if (participant.status !== ParticipantStatus.REQUESTED) {
      throw new BadRequestException(`Participant is not in REQUESTED status (currently: ${participant.status})`);
    }

    participant.status = ParticipantStatus.ACCEPTED;
    participant.joinedAt = new Date();
    participant.leftAt = null;
    await participant.save();

    this.logger.log(`Request accepted for user ${targetUserId} in classroom [${code}]`);

    // Notify specific student
    this.classroomGateway.notifyStudentAccepted(targetUserId, {
      classroomCode: classroom.code,
      classroomId: classroom._id.toString(),
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
      status: participant.status,
      joinedAt: participant.joinedAt,
    });

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

    const participant = await this.participantModel.findOne({
      classroomId: classroom._id,
      userId: new Types.ObjectId(targetUserId),
    });

    if (!participant) {
      throw new NotFoundException('Join request not found for this user');
    }

    participant.status = ParticipantStatus.REJECTED;
    await participant.save();

    this.logger.log(`Request rejected for user ${targetUserId} in classroom [${code}]`);

    // Notify student
    this.classroomGateway.notifyStudentRejected(targetUserId, {
      classroomCode: classroom.code,
      classroomId: classroom._id.toString(),
      status: ParticipantStatus.REJECTED,
      message: 'Your join request was rejected by the host',
    });

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

    const participant = await this.participantModel.findOne({
      classroomId: classroom._id,
      userId: new Types.ObjectId(user.id),
    });

    if (!participant) {
      throw new NotFoundException('Participant record not found in this classroom');
    }

    const now = new Date();
    participant.status = ParticipantStatus.LEFT;
    participant.leftAt = now;

    if (participant.joinedAt) {
      const sessionSeconds = Math.max(
        0,
        Math.round((now.getTime() - new Date(participant.joinedAt).getTime()) / 1000),
      );
      participant.durationSeconds = (participant.durationSeconds || 0) + sessionSeconds;
    }
    await participant.save();

    this.logger.log(`User ${user.email} left classroom [${code}] (Duration: ${participant.durationSeconds}s)`);

    // Broadcast user-left to classroom
    this.classroomGateway.broadcastToClassroom(classroom.code, 'classroom:user-left', {
      userId: user.id,
      name: user.name,
      durationSeconds: participant.durationSeconds,
      durationFormatted: formatDuration(participant.durationSeconds || 0),
    });

    return {
      success: true,
      message: 'Left classroom successfully',
      data: {
        durationSeconds: participant.durationSeconds,
        durationFormatted: formatDuration(participant.durationSeconds || 0),
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
    classroom.status = ClassroomStatus.ENDED;
    classroom.endedAt = now;
    classroom.endedReason = ClassroomEndedReason.HOST_ENDED;
    await classroom.save();

    // Finalize all active participants' duration
    await this.finalizeActiveParticipantsDuration(classroom._id, now);

    this.logger.log(`Classroom [${code}] ended by host ${user.email}`);

    // Broadcast classroom:ended
    this.classroomGateway.broadcastToClassroom(classroom.code, 'classroom:ended', {
      classroomCode: classroom.code,
      endedAt: classroom.endedAt,
      reason: ClassroomEndedReason.HOST_ENDED,
      message: 'The host has ended this classroom session',
    });

    return {
      success: true,
      message: 'Classroom ended successfully',
    };
  }

  /**
   * 10. AUTO-END CLASSROOM DUE TO INACTIVITY
   * Called when no active participants remain in the classroom.
   */
  async autoEndClassroomDueToInactivity(code: string) {
    const classroom = await this.classroomModel.findOne({
      code: code.toUpperCase().trim(),
    });

    if (!classroom || classroom.status === ClassroomStatus.ENDED) {
      return;
    }

    const now = new Date();
    classroom.status = ClassroomStatus.ENDED;
    classroom.endedAt = now;
    classroom.endedReason = ClassroomEndedReason.INACTIVITY;
    await classroom.save();

    // Finalize duration for all participants who were in the class
    await this.finalizeActiveParticipantsDuration(classroom._id, now);

    this.logger.log(
      `Classroom [${code}] automatically ended due to inactivity (no participants connected).`,
    );

    // Broadcast notification to sockets if any reconnect
    this.classroomGateway.broadcastToClassroom(classroom.code, 'classroom:ended', {
      classroomCode: classroom.code,
      endedAt: classroom.endedAt,
      reason: ClassroomEndedReason.INACTIVITY,
      message: 'Classroom was automatically closed due to inactivity',
    });
  }

  /**
   * Helper to finalize duration for active participants when class ends
   */
  private async finalizeActiveParticipantsDuration(
    classroomId: Types.ObjectId,
    endedAt: Date,
  ) {
    const rawParticipants = await this.participantModel.find({
      classroomId,
      status: { $in: [ParticipantStatus.ACCEPTED, ParticipantStatus.LEFT] },
    });
    const participants = Array.isArray(rawParticipants) ? rawParticipants : [];

    for (const p of participants) {
      if (!p.leftAt && p.joinedAt) {
        p.leftAt = endedAt;
        const sessionSeconds = Math.max(
          0,
          Math.round((endedAt.getTime() - new Date(p.joinedAt).getTime()) / 1000),
        );
        p.durationSeconds = (p.durationSeconds || 0) + sessionSeconds;
        await p.save();
      }
    }
  }

  /**
   * 11. TEACHER DASHBOARD HISTORY
   * Returns all classrooms created by the teacher with participants and attendance time.
   */
  async getTeacherHistory(userId: string) {
    const classrooms = await this.classroomModel
      .find({ hostId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec();

    const history = await Promise.all(
      classrooms.map(async (c) => {
        const participants = await this.participantModel
          .find({ classroomId: c._id })
          .populate('userId', 'name email avatar')
          .exec();

        const formattedParticipants = participants.map((p) => {
          const u = p.userId as any;
          return {
            userId: u?._id ? u._id.toString() : p.userId.toString(),
            name: u?.name || 'Unknown',
            email: u?.email || '',
            avatar: u?.avatar || null,
            role: p.role,
            status: p.status,
            joinedAt: p.joinedAt,
            leftAt: p.leftAt || null,
            durationSeconds: p.durationSeconds || 0,
            durationFormatted: formatDuration(p.durationSeconds || 0),
          };
        });

        // Compute total classroom session duration
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
          id: c._id.toString(),
          name: c.name,
          code: c.code,
          status: c.status,
          createdAt: c.createdAt,
          endedAt: c.endedAt || null,
          endedReason: c.endedReason || null,
          totalClassDurationSeconds,
          totalClassDurationFormatted: formatDuration(totalClassDurationSeconds),
          totalParticipantsCount: formattedParticipants.length,
          participants: formattedParticipants,
        };
      }),
    );

    return {
      success: true,
      data: history,
    };
  }

  /**
   * 12. STUDENT DASHBOARD HISTORY
   * Returns all classrooms attended by the student with attendance duration and details.
   */
  async getStudentHistory(userId: string) {
    const studentRecords = await this.participantModel
      .find({
        userId: new Types.ObjectId(userId),
        role: ParticipantRole.STUDENT,
        status: { $in: [ParticipantStatus.ACCEPTED, ParticipantStatus.LEFT] },
      })
      .sort({ createdAt: -1 })
      .exec();

    const history = await Promise.all(
      studentRecords.map(async (record) => {
        const classroom = await this.classroomModel.findById(record.classroomId);
        if (!classroom) return null;

        const host = await this.usersService.findById(classroom.hostId.toString());

        const classmatesCount = await this.participantModel.countDocuments({
          classroomId: classroom._id,
          role: ParticipantRole.STUDENT,
          status: { $in: [ParticipantStatus.ACCEPTED, ParticipantStatus.LEFT] },
        });

        let totalClassDurationSeconds = 0;
        if (classroom.endedAt) {
          totalClassDurationSeconds = Math.max(
            0,
            Math.round((classroom.endedAt.getTime() - classroom.createdAt.getTime()) / 1000),
          );
        }

        return {
          classroomId: classroom._id.toString(),
          name: classroom.name,
          code: classroom.code,
          status: classroom.status,
          createdAt: classroom.createdAt,
          endedAt: classroom.endedAt || null,
          endedReason: classroom.endedReason || null,
          totalClassDurationSeconds,
          totalClassDurationFormatted: formatDuration(totalClassDurationSeconds),
          host: host
            ? {
                id: host._id.toString(),
                name: host.name,
                email: host.email,
              }
            : { id: classroom.hostId.toString() },
          myAttendance: {
            joinedAt: record.joinedAt || null,
            leftAt: record.leftAt || null,
            durationSeconds: record.durationSeconds || 0,
            durationFormatted: formatDuration(record.durationSeconds || 0),
          },
          totalClassmatesCount: Math.max(0, classmatesCount - 1),
        };
      }),
    );

    return {
      success: true,
      data: history.filter(Boolean),
    };
  }

  /**
   * 13. SPECIFIC CLASSROOM DETAILED REPORT / HISTORY
   */
  async getClassroomHistory(code: string, user: AuthenticatedUser) {
    const classroom = await this.findClassroomByCode(code);

    // Verify user was host or participant
    const isHost = classroom.hostId.toString() === user.id;
    const participant = await this.participantModel.findOne({
      classroomId: classroom._id,
      userId: new Types.ObjectId(user.id),
    });

    if (!isHost && !participant) {
      throw new ForbiddenException('Forbidden: You were not part of this classroom');
    }

    const participants = await this.participantModel
      .find({ classroomId: classroom._id })
      .populate('userId', 'name email avatar')
      .exec();

    const formattedParticipants = participants.map((p) => {
      const u = p.userId as any;
      return {
        userId: u?._id ? u._id.toString() : p.userId.toString(),
        name: u?.name || 'Unknown',
        email: u?.email || '',
        avatar: u?.avatar || null,
        role: p.role,
        status: p.status,
        joinedAt: p.joinedAt,
        leftAt: p.leftAt || null,
        durationSeconds: p.durationSeconds || 0,
        durationFormatted: formatDuration(p.durationSeconds || 0),
      };
    });

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
        id: classroom._id.toString(),
        name: classroom.name,
        code: classroom.code,
        status: classroom.status,
        createdAt: classroom.createdAt,
        endedAt: classroom.endedAt || null,
        endedReason: classroom.endedReason || null,
        totalClassDurationSeconds,
        totalClassDurationFormatted: formatDuration(totalClassDurationSeconds),
        totalParticipantsCount: formattedParticipants.length,
        participants: formattedParticipants,
      },
    };
  }
}
