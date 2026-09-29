import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { UsersService } from '../users/users.service.js';
import { Classroom, ClassroomDocument } from '../classrooms/schemas/classroom.schema.js';
import { Participant, ParticipantDocument } from '../classrooms/schemas/participant.schema.js';
import { WhiteboardService } from '../whiteboard/whiteboard.service.js';
import { PdfService } from '../pdf/pdf.service.js';
import { WebrtcService } from '../webrtc/webrtc.service.js';
import { formatDuration } from '../common/utils/format-duration.util.js';
import {
  ClassroomStatus,
  ClassroomEndedReason,
  ParticipantStatus,
  WhiteboardOperationType,
} from '../common/constants/statuses.enum.js';
import { ParticipantRole } from '../common/constants/roles.enum.js';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface.js';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface.js';
import { JoinRoomDto } from './dto/join-room.dto.js';
import { LeaveRoomDto } from './dto/leave-room.dto.js';
import { WhiteboardDrawDto } from '../whiteboard/dto/whiteboard-draw.dto.js';
import { WhiteboardEraseDto } from '../whiteboard/dto/whiteboard-erase.dto.js';
import { SharePdfDto } from '../pdf/dto/share-pdf.dto.js';
import { PageChangeDto } from '../pdf/dto/page-change.dto.js';
import { WebrtcSignalDto } from '../webrtc/dto/webrtc-signal.dto.js';

@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
@WebSocketGateway({
  namespace: '/classroom',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class ClassroomGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ClassroomGateway.name);

  // Map: userId -> Set of active socket IDs
  private readonly userSockets = new Map<string, Set<string>>();

  // Map: classroomCode -> Set of userIds currently in the classroom
  private readonly classroomActiveUsers = new Map<string, Set<string>>();

  // Map: classroomCode -> NodeJS.Timeout for automatic inactivity deletion/ending
  private readonly inactivityTimers = new Map<string, NodeJS.Timeout>();

  // Map: classroomCode -> Map<userId, { userName: string; hasVideo: boolean }>
  private readonly voiceChatActivePeers = new Map<string, Map<string, { userName: string; hasVideo: boolean }>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly whiteboardService: WhiteboardService,
    private readonly pdfService: PdfService,
    private readonly webrtcService: WebrtcService,
    @InjectModel(Classroom.name)
    private readonly classroomModel: Model<ClassroomDocument>,
    @InjectModel(Participant.name)
    private readonly participantModel: Model<ParticipantDocument>,
  ) {}

  afterInit() {
    this.logger.log('ClassroomGateway initialized on namespace /classroom');
  }

  async handleConnection(client: Socket) {
    try {
      let token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization;

      if (!token) {
        this.logger.warn(`Socket connection rejected: No token provided (${client.id})`);
        client.disconnect(true);
        return;
      }

      if (token.startsWith('Bearer ')) {
        token = token.slice(7).trim();
      }

      const secret =
        this.configService.get<string>('jwtSecret') ||
        this.configService.get<string>('JWT_SECRET') ||
        'tdp-classroom-lite-jwt-secret-key-2025';

      const payload = this.jwtService.verify<JwtPayload>(token, { secret });
      const user = await this.usersService.findById(payload.sub);

      if (!user) {
        this.logger.warn(`Socket connection rejected: User ${payload.sub} not found`);
        client.disconnect(true);
        return;
      }

      const authenticatedUser: AuthenticatedUser = {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        avatar: user.avatar,
      };

      client.data.user = authenticatedUser;

      // Track socket ID under user
      if (!this.userSockets.has(authenticatedUser.id)) {
        this.userSockets.set(authenticatedUser.id, new Set());
      }
      this.userSockets.get(authenticatedUser.id)!.add(client.id);

      this.logger.log(`Socket connected: ${client.id} (User: ${user.name} - ${user.email})`);
    } catch (error: any) {
      this.logger.warn(`Socket authentication failed: ${error.message} (${client.id})`);
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    const user = client.data.user as AuthenticatedUser | undefined;
    if (user && this.userSockets.has(user.id)) {
      const socketSet = this.userSockets.get(user.id)!;
      socketSet.delete(client.id);
      if (socketSet.size === 0) {
        this.userSockets.delete(user.id);
      }
    }

    const classroomCode = client.data.classroomCode;
    if (classroomCode && user) {
      const code = classroomCode.toUpperCase().trim();
      if (this.voiceChatActivePeers.has(code)) {
        this.voiceChatActivePeers.get(code)!.delete(user.id);
        if (this.voiceChatActivePeers.get(code)!.size === 0) {
          this.voiceChatActivePeers.delete(code);
        }
      }
      client.to(`classroom:${code}`).emit('voicechat:left', { userId: user.id });

      await this.handleUserExitedClassroom(classroomCode, user);
      client.to(`classroom:${classroomCode}`).emit('classroom:user-left', {
        userId: user.id,
        name: user.name,
      });
    }

    this.logger.log(`Socket disconnected: ${client.id}`);
  }

  // Helper method: get authenticated user from socket
  private getAuthUser(client: Socket): AuthenticatedUser {
    const user = client.data.user as AuthenticatedUser;
    if (!user) {
      throw new WsException('Unauthorized: No authenticated user session found');
    }
    return user;
  }

  // ==========================================
  // INACTIVITY TIMERS & TRACKING
  // ==========================================

  scheduleInitialInactivityTimer(classroomCode: string, delayMs = 300000) {
    this.scheduleInactivityTimer(classroomCode, delayMs);
  }

  scheduleInactivityTimer(classroomCode: string, delayMs = 60000) {
    this.clearInactivityTimer(classroomCode);

    const timer = setTimeout(async () => {
      try {
        const activeSet = this.classroomActiveUsers.get(classroomCode);
        if (!activeSet || activeSet.size === 0) {
          this.logger.warn(
            `Classroom [${classroomCode}] has had 0 active participants for ${Math.round(
              delayMs / 1000,
            )}s. Auto-ending classroom.`,
          );
          await this.autoEndClassroomDueToInactivity(classroomCode);
          this.classroomActiveUsers.delete(classroomCode);
          this.inactivityTimers.delete(classroomCode);
        }
      } catch (err: any) {
        this.logger.error(`Error auto-ending classroom ${classroomCode}: ${err.message}`);
      }
    }, delayMs);

    this.inactivityTimers.set(classroomCode, timer);
  }

  clearInactivityTimer(classroomCode: string) {
    const timer = this.inactivityTimers.get(classroomCode);
    if (timer) {
      clearTimeout(timer);
      this.inactivityTimers.delete(classroomCode);
    }
  }

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

    // Finalize duration for active participants
    const rawParticipants = await this.participantModel.find({
      classroomId: classroom._id,
      status: { $in: [ParticipantStatus.ACCEPTED, ParticipantStatus.LEFT] },
    });
    const participants = Array.isArray(rawParticipants) ? rawParticipants : [];

    for (const p of participants) {
      if (!p.leftAt && p.joinedAt) {
        p.leftAt = now;
        const sessionSecs = Math.max(
          0,
          Math.round((now.getTime() - new Date(p.joinedAt).getTime()) / 1000),
        );
        p.durationSeconds = (p.durationSeconds || 0) + sessionSecs;
        await p.save();
      }
    }

    this.logger.log(
      `Classroom [${code}] automatically ended due to inactivity (no participants connected).`,
    );

    this.broadcastToClassroom(classroom.code, 'classroom:ended', {
      classroomCode: classroom.code,
      endedAt: classroom.endedAt,
      reason: ClassroomEndedReason.INACTIVITY,
      message: 'Classroom was automatically closed due to inactivity',
    });
  }

  private async handleUserExitedClassroom(code: string, user: AuthenticatedUser) {
    const activeSet = this.classroomActiveUsers.get(code);
    if (activeSet) {
      activeSet.delete(user.id);

      // Record leftAt and compute duration in DB
      const classroom = await this.classroomModel.findOne({ code });
      if (classroom) {
        const participant = await this.participantModel.findOne({
          classroomId: classroom._id,
          userId: new Types.ObjectId(user.id),
        });

        if (participant && participant.joinedAt) {
          const now = new Date();
          participant.leftAt = now;
          const sessionSecs = Math.max(
            0,
            Math.round((now.getTime() - new Date(participant.joinedAt).getTime()) / 1000),
          );
          participant.durationSeconds = (participant.durationSeconds || 0) + sessionSecs;
          await participant.save();
        }
      }

      // If classroom is now completely empty, start inactivity timer!
      if (activeSet.size === 0) {
        this.logger.warn(
          `All participants have exited classroom [${code}]. Scheduling auto-deletion/ending in 60s.`,
        );
        this.scheduleInactivityTimer(code, 60000);
      }
    }
  }

  // ==========================================
  // CLASSROOM LIFECYCLE EVENTS
  // ==========================================

  /**
   * Host forwards accept decision → relays to student via socket.
   * This handles the case where the REST-triggered emitToUser() may have missed
   * the student due to a socket reconnect after request submission.
   */
  @SubscribeMessage('classroom:request:accepted')
  async handleRequestAccepted(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { classroomCode: string; userId: string },
  ) {
    const user = this.getAuthUser(client);
    const code = payload.classroomCode?.toUpperCase().trim();
    if (!code || !payload.userId) return;

    const classroom = await this.classroomModel.findOne({ code });
    if (!classroom) return;

    // Only host can call this
    if (classroom.hostId.toString() !== user.id) return;

    // Re-emit accepted notification directly to student
    this.notifyStudentAccepted(payload.userId, {
      classroomCode: code,
      classroomId: classroom._id.toString(),
      status: ParticipantStatus.ACCEPTED,
      message: 'Your join request was accepted by the host',
    });

    return { success: true };
  }

  /**
   * Host forwards reject decision → relays to student via socket.
   */
  @SubscribeMessage('classroom:request:rejected')
  async handleRequestRejected(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { classroomCode: string; userId: string },
  ) {
    const user = this.getAuthUser(client);
    const code = payload.classroomCode?.toUpperCase().trim();
    if (!code || !payload.userId) return;

    const classroom = await this.classroomModel.findOne({ code });
    if (!classroom) return;

    if (classroom.hostId.toString() !== user.id) return;

    this.notifyStudentRejected(payload.userId, {
      classroomCode: code,
      classroomId: classroom._id.toString(),
      status: ParticipantStatus.REJECTED,
      message: 'Your join request was rejected by the host',
    });

    return { success: true };
  }

  /**
   * Student polls their own join-request status.
   * Emits classroom:request:status back to the caller with current DB status.
   * The frontend can call this on reconnect to check if already accepted/rejected.
   */
  @SubscribeMessage('classroom:request:status')
  async handleRequestStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { classroomCode: string },
  ) {
    const user = this.getAuthUser(client);
    const code = payload.classroomCode?.toUpperCase().trim();
    if (!code) return;

    const classroom = await this.classroomModel.findOne({ code });
    if (!classroom) return;

    const participant = await this.participantModel.findOne({
      classroomId: classroom._id,
      userId: new Types.ObjectId(user.id),
    });

    const status = participant?.status || null;
    client.emit('classroom:request:status', { classroomCode: code, status });

    // If accepted, also emit the full acceptance event so the frontend navigates
    if (status === ParticipantStatus.ACCEPTED) {
      client.emit('classroom:request:accepted', {
        classroomCode: code,
        classroomId: classroom._id.toString(),
        status: ParticipantStatus.ACCEPTED,
        message: 'Your join request was accepted by the host',
      });
    } else if (status === ParticipantStatus.REJECTED) {
      client.emit('classroom:request:rejected', {
        classroomCode: code,
        classroomId: classroom._id.toString(),
        status: ParticipantStatus.REJECTED,
        message: 'Your join request was rejected by the host',
      });
    }

    return { success: true, status };
  }

  @SubscribeMessage('classroom:tab-change')
  async handleTabChange(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: any,
  ) {
    this.getAuthUser(client);
    const code = client.data.classroomCode || dto?.classroomCode;
    if (!code) return { success: false };

    const tab = dto?.tab || dto?.activeTab;
    if (!tab) return { success: false };

    // Broadcast to all other participants in the room
    client.to(`classroom:${code}`).emit('classroom:tab-change', { activeTab: tab, tab });
    return { success: true };
  }

  @SubscribeMessage('classroom:join')
  async handleJoinClassroom(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: JoinRoomDto,
  ) {
    const user = this.getAuthUser(client);
    const code = dto.classroomCode.toUpperCase().trim();

    // Verify classroom exists & ACTIVE
    const classroom = await this.classroomModel.findOne({ code });
    if (!classroom) {
      throw new WsException('Classroom not found');
    }
    if (classroom.status !== ClassroomStatus.ACTIVE) {
      throw new WsException('Classroom is not active or has already ended');
    }

    // Verify participant is ACCEPTED
    const participant = await this.participantModel.findOne({
      classroomId: classroom._id,
      userId: new Types.ObjectId(user.id),
      status: ParticipantStatus.ACCEPTED,
    });

    if (!participant) {
      throw new WsException('Access denied: You are not an accepted participant of this classroom');
    }

    // Cancel any pending inactivity timer because someone joined!
    this.clearInactivityTimer(code);

    // Track user in active classroom users
    if (!this.classroomActiveUsers.has(code)) {
      this.classroomActiveUsers.set(code, new Set());
    }
    this.classroomActiveUsers.get(code)!.add(user.id);

    // Update participant session joinedAt
    participant.joinedAt = new Date();
    participant.leftAt = null;
    await participant.save();

    const roomName = `classroom:${code}`;
    await client.join(roomName);
    client.data.classroomCode = code;
    client.data.classroomId = classroom._id.toString();
    client.data.role = participant.role;

    // Fetch accepted participants
    const participants = await this.participantModel
      .find({
        classroomId: classroom._id,
        status: ParticipantStatus.ACCEPTED,
      })
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

    // Fetch whiteboard operations
    const whiteboardOps = await this.whiteboardService.getOperations(classroom._id.toString());

    // Send complete classroom state to the joining participant
    const statePayload = {
      classroom: {
        id: classroom._id.toString(),
        name: classroom.name,
        code: classroom.code,
        hostId: classroom.hostId.toString(),
        status: classroom.status,
      },
      participants: formattedParticipants,
      activePdf: classroom.activePdf || null,
      whiteboard: whiteboardOps,
    };

    client.emit('classroom:state', statePayload);

    // Notify other participants in the room
    client.to(roomName).emit('classroom:user-joined', {
      userId: user.id,
      name: user.name,
      role: participant.role,
    });

    this.logger.log(`User ${user.email} joined socket room: ${roomName} (Active count: ${this.classroomActiveUsers.get(code)?.size})`);
    return { success: true, message: `Joined classroom ${code}` };
  }

  @SubscribeMessage('classroom:leave')
  async handleLeaveClassroom(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: LeaveRoomDto,
  ) {
    const user = this.getAuthUser(client);
    const code = dto.classroomCode.toUpperCase().trim();
    const roomName = `classroom:${code}`;

    await client.leave(roomName);
    delete client.data.classroomCode;
    delete client.data.classroomId;
    delete client.data.role;

    await this.handleUserExitedClassroom(code, user);

    client.to(roomName).emit('classroom:user-left', {
      userId: user.id,
      name: user.name,
    });

    this.logger.log(`User ${user.email} left socket room: ${roomName}`);
    return { success: true, message: `Left classroom ${code}` };
  }

  // ==========================================
  // WHITEBOARD EVENTS
  // ==========================================

  @SubscribeMessage('whiteboard:draw')
  async handleWhiteboardDraw(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: WhiteboardDrawDto,
  ) {
    const user = this.getAuthUser(client);
    const code = client.data.classroomCode;
    const classroomId = client.data.classroomId;

    if (!code || !classroomId) {
      throw new WsException('You must join a classroom first before drawing');
    }

    const op = await this.whiteboardService.saveOperation(classroomId, user.id, {
      type: WhiteboardOperationType.DRAW,
      x1: dto.x1,
      y1: dto.y1,
      x2: dto.x2,
      y2: dto.y2,
      color: dto.color || '#000000',
      width: dto.width,
    });

    // Broadcast to everyone in the room
    this.server.to(`classroom:${code}`).emit('whiteboard:draw', {
      id: op._id.toString(),
      userId: user.id,
      type: op.type,
      x1: op.x1,
      y1: op.y1,
      x2: op.x2,
      y2: op.y2,
      color: op.color,
      width: op.width,
      createdAt: op.createdAt,
    });

    return { success: true };
  }

  @SubscribeMessage('whiteboard:erase')
  async handleWhiteboardErase(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: WhiteboardEraseDto,
  ) {
    const user = this.getAuthUser(client);
    const code = client.data.classroomCode;
    const classroomId = client.data.classroomId;

    if (!code || !classroomId) {
      throw new WsException('You must join a classroom first before erasing');
    }

    const op = await this.whiteboardService.saveOperation(classroomId, user.id, {
      type: WhiteboardOperationType.ERASE,
      x1: dto.x1,
      y1: dto.y1,
      x2: dto.x2,
      y2: dto.y2,
      width: dto.width,
    });

    this.server.to(`classroom:${code}`).emit('whiteboard:erase', {
      id: op._id.toString(),
      userId: user.id,
      type: op.type,
      x1: op.x1,
      y1: op.y1,
      x2: op.x2,
      y2: op.y2,
      width: op.width,
      createdAt: op.createdAt,
    });

    return { success: true };
  }

  @SubscribeMessage('whiteboard:clear')
  async handleWhiteboardClear(@ConnectedSocket() client: Socket) {
    const user = this.getAuthUser(client);
    const code = client.data.classroomCode;
    const classroomId = client.data.classroomId;
    const role = client.data.role;

    if (!code || !classroomId) {
      throw new WsException('You must join a classroom first');
    }

    if (role !== ParticipantRole.HOST) {
      throw new WsException('Forbidden: Only the host can clear the whiteboard');
    }

    await this.whiteboardService.clearOperations(classroomId);

    this.server.to(`classroom:${code}`).emit('whiteboard:cleared', {
      clearedBy: user.id,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`Whiteboard cleared for classroom ${code} by host ${user.email}`);
    return { success: true };
  }

  @SubscribeMessage('whiteboard:state')
  async handleWhiteboardState(@ConnectedSocket() client: Socket) {
    this.getAuthUser(client);
    const classroomId = client.data.classroomId;

    if (!classroomId) {
      throw new WsException('You must join a classroom first');
    }

    const operations = await this.whiteboardService.getOperations(classroomId);
    client.emit('whiteboard:state', { operations });
    return { success: true };
  }

  // ==========================================
  // PDF SYNCHRONIZATION EVENTS
  // ==========================================

  @SubscribeMessage('pdf:share')
  async handlePdfShare(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: SharePdfDto,
  ) {
    const user = this.getAuthUser(client);
    let code = (client.data.classroomCode || dto?.classroomCode || '').toUpperCase().trim();
    let classroomId = client.data.classroomId;

    let classroom = null;
    if (code) {
      classroom = await this.classroomModel.findOne({ code });
    } else if (classroomId) {
      classroom = await this.classroomModel.findById(new Types.ObjectId(classroomId));
      if (classroom) code = classroom.code;
    }

    if (!classroom) {
      this.logger.warn(`pdf:share failed: Classroom not found for code '${code}'`);
      throw new WsException('Classroom not found');
    }
    classroomId = classroom._id.toString();

    // Verify user is host
    const isHost = classroom.hostId.toString() === user.id;
    if (!isHost) {
      this.logger.warn(`pdf:share failed: User ${user.email} is not host of classroom ${code}`);
      throw new WsException('Forbidden: Only the host can share a PDF');
    }

    // Ensure socket state is set and joined to room
    client.data.classroomCode = code;
    client.data.classroomId = classroomId;
    client.data.role = ParticipantRole.HOST;
    await client.join(`classroom:${code}`);

    const activePdf = await this.pdfService.sharePdf(classroomId, dto);

    this.logger.log(`PDF shared in classroom ${code} by ${user.email}: ${dto.fileName}. Broadcasting to classroom:${code}`);
    this.server.to(`classroom:${code}`).emit('pdf:shared', activePdf);
    return { success: true, activePdf };
  }

  @SubscribeMessage('pdf:page-change')
  async handlePdfPageChange(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: any,
  ) {
    const user = this.getAuthUser(client);
    let code = (client.data.classroomCode || dto?.classroomCode || '').toUpperCase().trim();
    let classroomId = client.data.classroomId;

    let classroom = null;
    if (code) {
      classroom = await this.classroomModel.findOne({ code });
    } else if (classroomId) {
      classroom = await this.classroomModel.findById(new Types.ObjectId(classroomId));
      if (classroom) code = classroom.code;
    }

    if (!classroom) {
      throw new WsException('Classroom not found');
    }
    classroomId = classroom._id.toString();

    const isHost = classroom.hostId.toString() === user.id;
    if (!isHost) {
      throw new WsException('Forbidden: Only the host can change PDF pages');
    }

    client.data.classroomCode = code;
    client.data.classroomId = classroomId;
    client.data.role = ParticipantRole.HOST;

    const page = typeof dto?.page === 'number' ? dto.page : dto?.currentPage || 1;
    const activePdf = await this.pdfService.changePage(classroomId, page);

    this.server.to(`classroom:${code}`).emit('pdf:page-changed', {
      page: activePdf.currentPage,
    });

    return { success: true, page: activePdf.currentPage };
  }

  @SubscribeMessage('pdf:close')
  async handlePdfClose(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto?: any,
  ) {
    const user = this.getAuthUser(client);
    let code = (client.data.classroomCode || dto?.classroomCode || '').toUpperCase().trim();
    let classroomId = client.data.classroomId;

    let classroom = null;
    if (code) {
      classroom = await this.classroomModel.findOne({ code });
    } else if (classroomId) {
      classroom = await this.classroomModel.findById(new Types.ObjectId(classroomId));
      if (classroom) code = classroom.code;
    }

    if (!classroom) {
      throw new WsException('Classroom not found');
    }
    classroomId = classroom._id.toString();

    const isHost = classroom.hostId.toString() === user.id;
    if (!isHost) {
      throw new WsException('Forbidden: Only the host can close the PDF');
    }

    await this.pdfService.closePdf(classroomId);

    this.server.to(`classroom:${code}`).emit('pdf:closed', {
      timestamp: new Date().toISOString(),
    });

    return { success: true };
  }

  @SubscribeMessage('pdf:annotate')
  async handlePdfAnnotate(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: any,
  ) {
    this.getAuthUser(client);
    const code = (client.data.classroomCode || dto?.classroomCode || '').toUpperCase().trim();
    if (!code) return { success: false };

    client.to(`classroom:${code}`).emit('pdf:annotate', dto);
    return { success: true };
  }

  @SubscribeMessage('pdf:erase')
  async handlePdfErase(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: any,
  ) {
    this.getAuthUser(client);
    const code = (client.data.classroomCode || dto?.classroomCode || '').toUpperCase().trim();
    if (!code) return { success: false };

    client.to(`classroom:${code}`).emit('pdf:erase', dto);
    return { success: true };
  }

  @SubscribeMessage('pdf:clear-annotations')
  async handlePdfClearAnnotations(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: any,
  ) {
    this.getAuthUser(client);
    const code = (client.data.classroomCode || dto?.classroomCode || '').toUpperCase().trim();
    if (!code) return { success: false };

    client.to(`classroom:${code}`).emit('pdf:clear-annotations', dto);
    return { success: true };
  }

  // ==========================================
  // WEBRTC SCREEN SHARING SIGNALING
  // ==========================================

  @SubscribeMessage('webrtc:offer')
  async handleWebrtcOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: any,
  ) {
    const user = this.getAuthUser(client);
    const targetUserId = dto.targetUserId;
    if (!targetUserId) return { success: false };

    const offer = dto.offer || dto.data;

    this.emitToUser(targetUserId, 'webrtc:offer', {
      fromUserId: user.id,
      senderUserId: user.id,
      offer,
      data: offer,
    });

    return { success: true };
  }

  @SubscribeMessage('webrtc:answer')
  async handleWebrtcAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: any,
  ) {
    const user = this.getAuthUser(client);
    const targetUserId = dto.targetUserId;
    if (!targetUserId) return { success: false };

    const answer = dto.answer || dto.data;

    this.emitToUser(targetUserId, 'webrtc:answer', {
      fromUserId: user.id,
      senderUserId: user.id,
      answer,
      data: answer,
    });

    return { success: true };
  }

  @SubscribeMessage('webrtc:ice-candidate')
  async handleWebrtcIceCandidate(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: any,
  ) {
    const user = this.getAuthUser(client);
    const targetUserId = dto.targetUserId;
    if (!targetUserId) return { success: false };

    const candidate = dto.candidate || dto.data;

    this.emitToUser(targetUserId, 'webrtc:ice-candidate', {
      fromUserId: user.id,
      senderUserId: user.id,
      targetUserId,
      candidate,
      data: candidate,
    });

    return { success: true };
  }

  @SubscribeMessage('screenshare:started')
  async handleScreenshareStarted(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: any,
  ) {
    const user = this.getAuthUser(client);
    const rawCode = client.data.classroomCode || dto?.classroomCode;
    if (!rawCode) return { success: false };
    const code = rawCode.toUpperCase().trim();

    client.to(`classroom:${code}`).emit('screenshare:started', {
      classroomCode: code,
      hostId: user.id,
    });
    client.to(`classroom:${code}`).emit('webrtc:host-sharing', {
      classroomCode: code,
      hostId: user.id,
    });
    return { success: true };
  }

  @SubscribeMessage('webrtc:host-sharing')
  async handleHostSharing(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: any,
  ) {
    return this.handleScreenshareStarted(client, dto);
  }

  @SubscribeMessage('webrtc:student-ready')
  async handleStudentReady(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: any,
  ) {
    const user = this.getAuthUser(client);
    const rawCode = client.data.classroomCode || dto?.classroomCode;
    if (!rawCode) return { success: false };
    const code = rawCode.toUpperCase().trim();

    const classroom = await this.classroomModel.findOne({ code });
    if (!classroom) return { success: false };

    this.emitToUser(classroom.hostId.toString(), 'webrtc:student-ready', {
      studentId: user.id,
      classroomCode: code,
    });
    return { success: true };
  }

  @SubscribeMessage('screenshare:stopped')
  async handleScreenshareStopped(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: any,
  ) {
    this.getAuthUser(client);
    const rawCode = client.data.classroomCode || dto?.classroomCode;
    if (!rawCode) return { success: false };
    const code = rawCode.toUpperCase().trim();

    client.to(`classroom:${code}`).emit('screenshare:stopped', { classroomCode: code });
    client.to(`classroom:${code}`).emit('webrtc:screen-stopped', { classroomCode: code });
    return { success: true };
  }

  @SubscribeMessage('webrtc:screen-stopped')
  async handleScreenStopped(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: any,
  ) {
    return this.handleScreenshareStopped(client, dto);
  }

  // ==========================================
  // VOICE & VIDEO CHAT (PEER-TO-PEER RELAY)
  // ==========================================

  @SubscribeMessage('voicechat:joined')
  async handleVoiceChatJoined(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: any,
  ) {
    const user = this.getAuthUser(client);
    const rawCode = client.data.classroomCode || dto?.classroomCode;
    if (!rawCode) return { success: false };
    const code = rawCode.toUpperCase().trim();

    if (!this.voiceChatActivePeers.has(code)) {
      this.voiceChatActivePeers.set(code, new Map());
    }
    const peerMap = this.voiceChatActivePeers.get(code)!;

    // Collect all other active peers in this classroom
    const existingPeers: Array<{ userId: string; userName: string; hasVideo: boolean }> = [];
    peerMap.forEach((info, peerUserId) => {
      if (peerUserId !== user.id) {
        existingPeers.push({
          userId: peerUserId,
          userName: info.userName,
          hasVideo: info.hasVideo,
        });
      }
    });

    // Register this user
    peerMap.set(user.id, {
      userName: user.name,
      hasVideo: dto?.hasVideo ?? false,
    });

    // Send the list of existing active peers back to the newly joined peer
    client.emit('voicechat:peers', {
      classroomCode: code,
      peers: existingPeers,
    });

    // Broadcast to everyone else in the room
    client.to(`classroom:${code}`).emit('voicechat:joined', {
      userId: user.id,
      userName: user.name,
      hasVideo: dto?.hasVideo ?? false,
    });

    return { success: true, peers: existingPeers };
  }

  @SubscribeMessage('voicechat:left')
  async handleVoiceChatLeft(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: any,
  ) {
    const user = this.getAuthUser(client);
    const rawCode = client.data.classroomCode || dto?.classroomCode;
    if (!rawCode) return { success: false };
    const code = rawCode.toUpperCase().trim();

    if (this.voiceChatActivePeers.has(code)) {
      this.voiceChatActivePeers.get(code)!.delete(user.id);
      if (this.voiceChatActivePeers.get(code)!.size === 0) {
        this.voiceChatActivePeers.delete(code);
      }
    }

    client.to(`classroom:${code}`).emit('voicechat:left', { userId: user.id });
    return { success: true };
  }

  @SubscribeMessage('voicechat:offer')
  async handleVoiceChatOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: any,
  ) {
    const user = this.getAuthUser(client);
    if (!dto?.targetUserId || !dto?.offer) return { success: false };
    this.emitToUser(dto.targetUserId, 'voicechat:offer', {
      fromUserId: user.id,
      fromUserName: user.name,
      offer: dto.offer,
    });
    return { success: true };
  }

  @SubscribeMessage('voicechat:answer')
  async handleVoiceChatAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: any,
  ) {
    const user = this.getAuthUser(client);
    if (!dto?.targetUserId || !dto?.answer) return { success: false };
    this.emitToUser(dto.targetUserId, 'voicechat:answer', {
      fromUserId: user.id,
      answer: dto.answer,
    });
    return { success: true };
  }

  @SubscribeMessage('voicechat:ice-candidate')
  async handleVoiceChatIceCandidate(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: any,
  ) {
    const user = this.getAuthUser(client);
    if (!dto?.targetUserId || !dto?.candidate) return { success: false };
    this.emitToUser(dto.targetUserId, 'voicechat:ice-candidate', {
      fromUserId: user.id,
      candidate: dto.candidate,
    });
    return { success: true };
  }

  @SubscribeMessage('voicechat:mute-state')
  async handleVoiceChatMuteState(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: any,
  ) {
    const user = this.getAuthUser(client);
    const code = client.data.classroomCode || dto?.classroomCode;
    if (!code) return { success: false };
    client.to(`classroom:${code}`).emit('voicechat:mute-state', {
      userId: user.id,
      audioMuted: dto?.audioMuted ?? false,
      videoMuted: dto?.videoMuted ?? false,
    });
    return { success: true };
  }

  @SubscribeMessage('voicechat:force-mute')
  async handleVoiceChatForceMute(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: any,
  ) {
    const user = this.getAuthUser(client);
    const code = client.data.classroomCode || dto?.classroomCode;
    if (!code || !dto?.targetUserId) return { success: false };

    // Verify the caller is the host
    const classroom = await this.classroomModel.findOne({ code });
    if (!classroom || classroom.hostId.toString() !== user.id) {
      return { success: false, message: 'Only host can force mute' };
    }

    // Forward the mute command to the target user
    this.emitToUser(dto.targetUserId, 'voicechat:force-mute', {
      fromUserId: user.id,
    });
    return { success: true };
  }

  // ==========================================
  // REAL-TIME NOTIFICATION HELPERS FOR REST APIS
  // ==========================================

  emitToUser(userId: string, event: string, payload: any) {
    const sockets = this.userSockets.get(userId);
    if (sockets && sockets.size > 0) {
      for (const socketId of sockets) {
        this.server.to(socketId).emit(event, payload);
      }
      return true;
    }
    return false;
  }

  broadcastToClassroom(classroomCode: string, event: string, payload: any) {
    this.server.to(`classroom:${classroomCode}`).emit(event, payload);
  }

  notifyHostNewRequest(hostUserId: string, payload: any) {
    this.emitToUser(hostUserId, 'classroom:request:new', payload);
  }

  notifyStudentAccepted(studentUserId: string, payload: any) {
    this.emitToUser(studentUserId, 'classroom:request:accepted', payload);
  }

  notifyStudentRejected(studentUserId: string, payload: any) {
    this.emitToUser(studentUserId, 'classroom:request:rejected', payload);
  }
}
