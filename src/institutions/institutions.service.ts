import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
  Inject,
  forwardRef,
  Optional,
} from '@nestjs/common';
import {
  InstitutionRole,
  InstitutionStatus,
  MembershipStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateInstitutionDto } from './dto/create-institution.dto.js';
import { UpdateInstitutionDto } from './dto/update-institution.dto.js';
import { generateInstitutionCode } from '../common/utils/generate-institution-code.util.js';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface.js';
import { ClassroomGateway } from '../realtime/classroom.gateway.js';

@Injectable()
export class InstitutionsService {
  private readonly logger = new Logger(InstitutionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(forwardRef(() => ClassroomGateway))
    private readonly classroomGateway?: ClassroomGateway,
  ) {}

  /**
   * Create an institution (Teacher only) with owner membership in a transaction
   */
  async create(userId: string, dto: CreateInstitutionDto) {
    // 1. Verify user is a TEACHER
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role !== UserRole.TEACHER) {
      throw new ForbiddenException('Only teachers can create an institution');
    }

    // 2. Generate unique uppercase code
    let code = generateInstitutionCode();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await this.prisma.institution.findUnique({
        where: { code },
      });
      if (!existing) break;
      code = generateInstitutionCode();
      attempts++;
    }

    // 3. Prisma transaction: Create Institution + InstitutionMembership (OWNER, ACCEPTED)
    const result = await this.prisma.$transaction(async (tx) => {
      const institution = await tx.institution.create({
        data: {
          name: dto.name,
          code,
          description: dto.description,
          logo: dto.logo,
          email: dto.email,
          phone: dto.phone,
          address: dto.address,
          website: dto.website,
          ownerId: userId,
          status: InstitutionStatus.ACTIVE,
        },
      });

      const membership = await tx.institutionMembership.create({
        data: {
          institutionId: institution.id,
          userId,
          role: InstitutionRole.OWNER,
          status: MembershipStatus.ACCEPTED,
          acceptedAt: new Date(),
        },
      });

      return { institution, membership };
    });

    this.logger.log(`Institution created: ${result.institution.name} [${code}] by teacher ${user.email}`);

    return {
      success: true,
      data: {
        id: result.institution.id,
        name: result.institution.name,
        code: result.institution.code,
        description: result.institution.description,
        logo: result.institution.logo,
        ownerId: result.institution.ownerId,
        role: result.membership.role,
        createdAt: result.institution.createdAt,
      },
    };
  }

  /**
   * Search institutions (Public info only: id, name, code, logo)
   */
  async search(query?: string) {
    const q = query ? query.trim() : '';

    const institutions = await this.prisma.institution.findMany({
      where: {
        status: InstitutionStatus.ACTIVE,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { code: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        code: true,
        logo: true,
        description: true,
      },
      take: 25,
      orderBy: { name: 'asc' },
    });

    return {
      success: true,
      data: institutions,
    };
  }

  /**
   * Get all ACCEPTED institutions of the current user
   */
  async getMyInstitutions(userId: string) {
    const memberships = await this.prisma.institutionMembership.findMany({
      where: {
        userId,
        status: MembershipStatus.ACCEPTED,
      },
      include: {
        institution: {
          select: {
            id: true,
            name: true,
            code: true,
            logo: true,
            description: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const data = memberships.map((m) => ({
      id: m.institution.id,
      name: m.institution.name,
      code: m.institution.code,
      role: m.role,
      status: m.status,
      logo: m.institution.logo,
      joinedAt: m.acceptedAt || m.createdAt,
    }));

    return {
      success: true,
      data,
    };
  }

  /**
   * Get institution details (Authorized members/owner only)
   */
  async getById(id: string, user: AuthenticatedUser) {
    const institution = await this.prisma.institution.findUnique({
      where: { id },
      include: {
        owner: {
          select: { id: true, name: true, email: true, avatar: true },
        },
      },
    });

    if (!institution) {
      throw new NotFoundException('Institution not found');
    }

    const membership = await this.prisma.institutionMembership.findUnique({
      where: {
        institutionId_userId: {
          institutionId: id,
          userId: user.id,
        },
      },
    });

    const isOwner = institution.ownerId === user.id;
    const isMember = membership && membership.status === MembershipStatus.ACCEPTED;

    if (!isOwner && !isMember) {
      throw new ForbiddenException('You are not an authorized member of this institution');
    }

    return {
      success: true,
      data: {
        id: institution.id,
        name: institution.name,
        code: institution.code,
        description: institution.description,
        logo: institution.logo,
        email: institution.email,
        phone: institution.phone,
        address: institution.address,
        website: institution.website,
        status: institution.status,
        owner: institution.owner,
        myRole: membership ? membership.role : (isOwner ? InstitutionRole.OWNER : null),
        createdAt: institution.createdAt,
      },
    };
  }

  /**
   * Update institution details (OWNER or ADMIN only)
   */
  async update(id: string, dto: UpdateInstitutionDto, user: AuthenticatedUser) {
    const institution = await this.prisma.institution.findUnique({
      where: { id },
    });

    if (!institution) {
      throw new NotFoundException('Institution not found');
    }

    const membership = await this.prisma.institutionMembership.findUnique({
      where: {
        institutionId_userId: {
          institutionId: id,
          userId: user.id,
        },
      },
    });

    const isOwner = institution.ownerId === user.id;
    const isAdmin = membership && membership.role === InstitutionRole.ADMIN && membership.status === MembershipStatus.ACCEPTED;

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('Only institution owner or admin can update institution details');
    }

    const updated = await this.prisma.institution.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        logo: dto.logo,
        email: dto.email,
        phone: dto.phone,
        address: dto.address,
        website: dto.website,
      },
    });

    return {
      success: true,
      data: updated,
    };
  }

  /**
   * Request to join institution by ID
   */
  async joinById(institutionId: string, user: AuthenticatedUser) {
    const institution = await this.prisma.institution.findUnique({
      where: { id: institutionId },
    });

    if (!institution || institution.status !== InstitutionStatus.ACTIVE) {
      throw new NotFoundException('Institution not found or inactive');
    }

    // Role in institution matches user's global role
    const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
    const targetRole = dbUser?.role === UserRole.TEACHER ? InstitutionRole.TEACHER : InstitutionRole.STUDENT;

    // Check existing membership
    const existing = await this.prisma.institutionMembership.findUnique({
      where: {
        institutionId_userId: {
          institutionId,
          userId: user.id,
        },
      },
    });

    let membership;
    if (existing) {
      if (existing.status === MembershipStatus.ACCEPTED) {
        throw new BadRequestException('You are already an accepted member of this institution');
      }
      if (existing.status === MembershipStatus.REQUESTED) {
        throw new BadRequestException('Your join request is already pending approval');
      }
      // Re-request if previously LEFT or REJECTED
      membership = await this.prisma.institutionMembership.update({
        where: { id: existing.id },
        data: {
          role: targetRole,
          status: MembershipStatus.REQUESTED,
          requestedAt: new Date(),
          acceptedAt: null,
        },
      });
    } else {
      membership = await this.prisma.institutionMembership.create({
        data: {
          institutionId,
          userId: user.id,
          role: targetRole,
          status: MembershipStatus.REQUESTED,
        },
      });
    }

    // Notify institution owner and admins via Socket.IO
    this.notifyInstitutionStaff(institutionId, 'institution:request:new', {
      institutionId,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: targetRole,
      },
      requestedAt: membership.requestedAt,
    });

    this.logger.log(`Join request submitted by ${user.email} (${targetRole}) for institution ${institution.name}`);

    return {
      success: true,
      message: 'Join request submitted successfully. Awaiting approval from institution administrators.',
      data: membership,
    };
  }

  /**
   * Request to join institution by unique code
   */
  async joinByCode(code: string, user: AuthenticatedUser) {
    const institution = await this.prisma.institution.findUnique({
      where: { code: code.trim().toUpperCase() },
    });

    if (!institution || institution.status !== InstitutionStatus.ACTIVE) {
      throw new NotFoundException('Institution with this code not found');
    }

    return this.joinById(institution.id, user);
  }

  /**
   * View pending membership requests (OWNER or ADMIN only)
   */
  async getRequests(institutionId: string, user: AuthenticatedUser, roleFilter?: InstitutionRole) {
    await this.assertOwnerOrAdmin(institutionId, user.id);

    const requests = await this.prisma.institutionMembership.findMany({
      where: {
        institutionId,
        status: MembershipStatus.REQUESTED,
        ...(roleFilter ? { role: roleFilter } : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
      orderBy: { requestedAt: 'asc' },
    });

    return {
      success: true,
      data: requests.map((r) => ({
        id: r.id,
        userId: r.userId,
        user: r.user,
        role: r.role,
        status: r.status,
        requestedAt: r.requestedAt,
      })),
    };
  }

  /**
   * Accept pending membership request (OWNER or ADMIN only)
   */
  async acceptRequest(institutionId: string, targetUserId: string, user: AuthenticatedUser) {
    await this.assertOwnerOrAdmin(institutionId, user.id);

    const membership = await this.prisma.institutionMembership.findUnique({
      where: {
        institutionId_userId: {
          institutionId,
          userId: targetUserId,
        },
      },
    });

    if (!membership || membership.status !== MembershipStatus.REQUESTED) {
      throw new NotFoundException('No pending join request found for this user');
    }

    const updated = await this.prisma.institutionMembership.update({
      where: { id: membership.id },
      data: {
        status: MembershipStatus.ACCEPTED,
        acceptedAt: new Date(),
      },
      include: {
        institution: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    // Emit Socket.IO event to accepted user
    if (this.classroomGateway) {
      this.classroomGateway.emitToUser(targetUserId, 'institution:member:accepted', {
        institutionId,
        institutionName: updated.institution.name,
        role: updated.role,
        acceptedAt: updated.acceptedAt,
      });
    }

    this.logger.log(`Institution join request accepted for user ${targetUserId} in institution ${institutionId}`);

    return {
      success: true,
      message: 'Institution join request accepted successfully',
      data: updated,
    };
  }

  /**
   * Reject pending membership request (OWNER or ADMIN only)
   */
  async rejectRequest(institutionId: string, targetUserId: string, user: AuthenticatedUser) {
    await this.assertOwnerOrAdmin(institutionId, user.id);

    const membership = await this.prisma.institutionMembership.findUnique({
      where: {
        institutionId_userId: {
          institutionId,
          userId: targetUserId,
        },
      },
    });

    if (!membership || membership.status !== MembershipStatus.REQUESTED) {
      throw new NotFoundException('No pending join request found for this user');
    }

    const updated = await this.prisma.institutionMembership.update({
      where: { id: membership.id },
      data: {
        status: MembershipStatus.REJECTED,
      },
      include: {
        institution: {
          select: { id: true, name: true },
        },
      },
    });

    // Emit Socket.IO event to rejected user
    if (this.classroomGateway) {
      this.classroomGateway.emitToUser(targetUserId, 'institution:member:rejected', {
        institutionId,
        institutionName: updated.institution.name,
      });
    }

    this.logger.log(`Institution join request rejected for user ${targetUserId} in institution ${institutionId}`);

    return {
      success: true,
      message: 'Institution join request rejected',
      data: updated,
    };
  }

  /**
   * Remove member from institution (OWNER or ADMIN only)
   */
  async removeMember(institutionId: string, targetUserId: string, user: AuthenticatedUser) {
    const callerMembership = await this.assertOwnerOrAdmin(institutionId, user.id);

    const targetMembership = await this.prisma.institutionMembership.findUnique({
      where: {
        institutionId_userId: {
          institutionId,
          userId: targetUserId,
        },
      },
    });

    if (!targetMembership) {
      throw new NotFoundException('Member not found in this institution');
    }

    if (targetMembership.role === InstitutionRole.OWNER) {
      throw new ForbiddenException('The institution owner cannot be removed');
    }

    if (callerMembership.role === InstitutionRole.ADMIN) {
      if (targetMembership.role === InstitutionRole.ADMIN) {
        throw new ForbiddenException('Admins cannot remove other admins');
      }
    }

    const updated = await this.prisma.institutionMembership.update({
      where: { id: targetMembership.id },
      data: {
        status: MembershipStatus.LEFT,
      },
    });

    // Emit Socket.IO event to removed user
    if (this.classroomGateway) {
      this.classroomGateway.emitToUser(targetUserId, 'institution:member:removed', {
        institutionId,
      });
    }

    this.logger.log(`User ${targetUserId} removed from institution ${institutionId} by ${user.email}`);

    return {
      success: true,
      message: 'Member removed from institution',
      data: updated,
    };
  }

  /**
   * Member leaves institution (OWNER cannot leave)
   */
  async leave(institutionId: string, user: AuthenticatedUser) {
    const membership = await this.prisma.institutionMembership.findUnique({
      where: {
        institutionId_userId: {
          institutionId,
          userId: user.id,
        },
      },
    });

    if (!membership || membership.status !== MembershipStatus.ACCEPTED) {
      throw new NotFoundException('You are not an active member of this institution');
    }

    if (membership.role === InstitutionRole.OWNER) {
      throw new BadRequestException('Institution owner cannot leave their own institution');
    }

    await this.prisma.institutionMembership.update({
      where: { id: membership.id },
      data: {
        status: MembershipStatus.LEFT,
      },
    });

    this.logger.log(`User ${user.email} left institution ${institutionId}`);

    return {
      success: true,
      message: 'Successfully left the institution',
    };
  }

  /**
   * Delete an institution (OWNER ONLY)
   */
  async delete(institutionId: string, user: AuthenticatedUser) {
    const institution = await this.prisma.institution.findUnique({
      where: { id: institutionId },
    });

    if (!institution) {
      throw new NotFoundException('Institution not found');
    }

    if (institution.ownerId !== user.id) {
      throw new ForbiddenException('Only the institution owner can delete this institution');
    }

    await this.prisma.institution.delete({
      where: { id: institutionId },
    });

    this.logger.log(`Institution ${institution.name} (${institutionId}) deleted by owner ${user.email}`);

    return {
      success: true,
      message: 'Institution deleted successfully',
    };
  }

  /**
   * Set or remove ADMIN role for an institution member (OWNER ONLY, only teachers can be admin)
   */
  async setAdminRole(
    institutionId: string,
    targetUserId: string,
    isAdmin: boolean,
    user: AuthenticatedUser,
  ) {
    const institution = await this.prisma.institution.findUnique({
      where: { id: institutionId },
    });

    if (!institution) {
      throw new NotFoundException('Institution not found');
    }

    if (institution.ownerId !== user.id) {
      throw new ForbiddenException('Only the institution owner can appoint or remove administrators');
    }

    if (targetUserId === user.id) {
      throw new BadRequestException('Institution owner cannot change their own administrative role');
    }

    const targetMembership = await this.prisma.institutionMembership.findUnique({
      where: {
        institutionId_userId: {
          institutionId,
          userId: targetUserId,
        },
      },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    if (!targetMembership || targetMembership.status !== MembershipStatus.ACCEPTED) {
      throw new NotFoundException('Target member not found or is not an accepted member of this institution');
    }

    // Only teachers can be made admin (Requirement 2: "only owner can make admin who is teacher")
    if (isAdmin) {
      if (
        targetMembership.user.role !== UserRole.TEACHER &&
        targetMembership.role !== InstitutionRole.TEACHER
      ) {
        throw new BadRequestException('Only teachers can be appointed as institution administrators');
      }

      const updated = await this.prisma.institutionMembership.update({
        where: { id: targetMembership.id },
        data: { role: InstitutionRole.ADMIN },
      });

      this.logger.log(
        `User ${targetUserId} appointed as ADMIN in institution ${institutionId} by owner ${user.email}`,
      );

      return {
        success: true,
        message: 'Member has been appointed as an Administrator',
        data: updated,
      };
    } else {
      const updated = await this.prisma.institutionMembership.update({
        where: { id: targetMembership.id },
        data: { role: InstitutionRole.TEACHER },
      });

      this.logger.log(
        `User ${targetUserId} reverted to TEACHER in institution ${institutionId} by owner ${user.email}`,
      );

      return {
        success: true,
        message: 'Administrator privileges removed',
        data: updated,
      };
    }
  }

  /**
   * Transfer institution ownership to another teacher (OWNER ONLY)
   */
  async transferOwnership(
    institutionId: string,
    newOwnerId: string,
    user: AuthenticatedUser,
  ) {
    const institution = await this.prisma.institution.findUnique({
      where: { id: institutionId },
    });

    if (!institution) {
      throw new NotFoundException('Institution not found');
    }

    if (institution.ownerId !== user.id) {
      throw new ForbiddenException('Only the institution owner can transfer ownership');
    }

    if (newOwnerId === user.id) {
      throw new BadRequestException('You are already the owner of this institution');
    }

    const targetMembership = await this.prisma.institutionMembership.findUnique({
      where: {
        institutionId_userId: {
          institutionId,
          userId: newOwnerId,
        },
      },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    if (!targetMembership || targetMembership.status !== MembershipStatus.ACCEPTED) {
      throw new NotFoundException('Target member not found or is not an accepted member of this institution');
    }

    if (
      targetMembership.user.role !== UserRole.TEACHER &&
      targetMembership.role !== InstitutionRole.TEACHER &&
      targetMembership.role !== InstitutionRole.ADMIN
    ) {
      throw new BadRequestException('Institution ownership can only be transferred to a teacher');
    }

    // Execute transfer in a database transaction
    await this.prisma.$transaction(async (tx) => {
      // 1. Update institution owner
      await tx.institution.update({
        where: { id: institutionId },
        data: { ownerId: newOwnerId },
      });

      // 2. Set new owner's membership to OWNER
      await tx.institutionMembership.update({
        where: { id: targetMembership.id },
        data: { role: InstitutionRole.OWNER },
      });

      // 3. Demote old owner's membership to TEACHER
      const oldOwnerMembership = await tx.institutionMembership.findUnique({
        where: {
          institutionId_userId: {
            institutionId,
            userId: user.id,
          },
        },
      });

      if (oldOwnerMembership) {
        await tx.institutionMembership.update({
          where: { id: oldOwnerMembership.id },
          data: { role: InstitutionRole.TEACHER },
        });
      }
    });

    this.logger.log(
      `Institution ${institution.name} (${institutionId}) ownership transferred from ${user.email} to ${newOwnerId}`,
    );

    return {
      success: true,
      message: 'Institution ownership transferred successfully',
    };
  }

  /**
   * View accepted members of institution (Authorized members only)
   */
  async getMembers(institutionId: string, user: AuthenticatedUser, roleFilter?: InstitutionRole) {
    // Caller must be an accepted member or owner
    const callerMembership = await this.prisma.institutionMembership.findUnique({
      where: {
        institutionId_userId: {
          institutionId,
          userId: user.id,
        },
      },
    });

    if (!callerMembership || callerMembership.status !== MembershipStatus.ACCEPTED) {
      throw new ForbiddenException('You must be a member of this institution to view its members');
    }

    const members = await this.prisma.institutionMembership.findMany({
      where: {
        institutionId,
        status: MembershipStatus.ACCEPTED,
        ...(roleFilter ? { role: roleFilter } : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
      orderBy: { acceptedAt: 'desc' },
    });

    return {
      success: true,
      data: members.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        avatar: m.user.avatar,
        role: m.role,
        joinedAt: m.acceptedAt || m.createdAt,
      })),
    };
  }

  /**
   * View institution statistics (Teachers, Students, Total members)
   */
  async getStats(institutionId: string, user: AuthenticatedUser) {
    const institution = await this.prisma.institution.findUnique({
      where: { id: institutionId },
    });

    if (!institution) {
      throw new NotFoundException('Institution not found');
    }

    // Verify caller is a member or owner
    const membership = await this.prisma.institutionMembership.findUnique({
      where: {
        institutionId_userId: {
          institutionId,
          userId: user.id,
        },
      },
    });

    if (!membership || membership.status !== MembershipStatus.ACCEPTED) {
      throw new ForbiddenException('Only members can view institution statistics');
    }

    const teachers = await this.prisma.institutionMembership.count({
      where: {
        institutionId,
        status: MembershipStatus.ACCEPTED,
        role: { in: [InstitutionRole.TEACHER, InstitutionRole.OWNER, InstitutionRole.ADMIN] },
      },
    });

    const students = await this.prisma.institutionMembership.count({
      where: {
        institutionId,
        status: MembershipStatus.ACCEPTED,
        role: InstitutionRole.STUDENT,
      },
    });

    return {
      success: true,
      data: {
        teachers,
        students,
        totalMembers: teachers + students,
      },
    };
  }

  // --- Helper Methods ---

  private async assertOwnerOrAdmin(institutionId: string, userId: string) {
    const institution = await this.prisma.institution.findUnique({
      where: { id: institutionId },
    });

    if (!institution) {
      throw new NotFoundException('Institution not found');
    }

    if (institution.ownerId === userId) {
      return { role: InstitutionRole.OWNER };
    }

    const membership = await this.prisma.institutionMembership.findUnique({
      where: {
        institutionId_userId: {
          institutionId,
          userId,
        },
      },
    });

    if (
      !membership ||
      membership.status !== MembershipStatus.ACCEPTED ||
      (membership.role !== InstitutionRole.OWNER && membership.role !== InstitutionRole.ADMIN)
    ) {
      throw new ForbiddenException('Only institution owner or admin can perform this action');
    }

    return membership;
  }

  private async notifyInstitutionStaff(institutionId: string, event: string, payload: any) {
    if (!this.classroomGateway) return;

    try {
      const staffMemberships = await this.prisma.institutionMembership.findMany({
        where: {
          institutionId,
          status: MembershipStatus.ACCEPTED,
          role: { in: [InstitutionRole.OWNER, InstitutionRole.ADMIN] },
        },
        select: { userId: true },
      });

      const staffIds = staffMemberships.map((s) => s.userId);
      this.classroomGateway.emitToUsers(staffIds, event, payload);
    } catch (err: any) {
      this.logger.warn(`Failed to notify staff for institution ${institutionId}: ${err?.message}`);
    }
  }

  /**
   * Get classrooms affiliated with an institution
   */
  async getClassrooms(institutionId: string, user: AuthenticatedUser) {
    const institution = await this.prisma.institution.findUnique({
      where: { id: institutionId },
    });
    if (!institution) {
      throw new NotFoundException('Institution not found');
    }

    const classrooms = await this.prisma.classroom.findMany({
      where: { institutionId },
      orderBy: { createdAt: 'desc' },
      include: {
        host: { select: { id: true, name: true, email: true } },
      },
    });

    return {
      success: true,
      data: classrooms.map((c) => ({
        id: c.id,
        name: c.name,
        code: c.code,
        status: c.status,
        type: c.type,
        institutionId: c.institutionId,
        hostId: c.hostId,
        host: c.host,
        createdAt: c.createdAt,
        endedAt: c.endedAt,
      })),
    };
  }
}
