import {
  PrismaClient,
  UserRole,
  InstitutionRole,
  MembershipStatus,
  InstitutionStatus,
  ClassroomType,
  ClassroomStatus,
  ParticipantRole,
  ParticipantStatus,
} from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting TDP Classroom Lite seed...');

  const passwordHash = await bcrypt.hash('Password123!', 10);

  // 1. Seed Teacher
  const teacher = await prisma.user.upsert({
    where: { email: 'teacher@tdpclassroom.com' },
    update: { isEmailVerified: true },
    create: {
      name: 'Professor Sharma',
      email: 'teacher@tdpclassroom.com',
      passwordHash,
      role: UserRole.TEACHER,
      isEmailVerified: true,
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    },
  });
  console.log(`✅ Teacher seeded: ${teacher.name} (${teacher.email})`);

  // 2. Seed Institution
  const institution = await prisma.institution.upsert({
    where: { code: 'TDP82K4' },
    update: {},
    create: {
      name: 'TDP Tech Institute',
      code: 'TDP82K4',
      description: 'Premier Technology & Computer Science Institute',
      ownerId: teacher.id,
      status: InstitutionStatus.ACTIVE,
      email: 'contact@tdptech.edu',
      website: 'https://tdptech.edu',
    },
  });
  console.log(`✅ Institution seeded: ${institution.name} [${institution.code}]`);

  // 3. Seed Teacher Membership (OWNER, ACCEPTED)
  await prisma.institutionMembership.upsert({
    where: {
      institutionId_userId: {
        institutionId: institution.id,
        userId: teacher.id,
      },
    },
    update: {},
    create: {
      institutionId: institution.id,
      userId: teacher.id,
      role: InstitutionRole.OWNER,
      status: MembershipStatus.ACCEPTED,
      acceptedAt: new Date(),
    },
  });
  console.log('✅ Teacher institution membership seeded (OWNER, ACCEPTED)');

  // 4. Seed Student
  const student = await prisma.user.upsert({
    where: { email: 'student@tdpclassroom.com' },
    update: { isEmailVerified: true },
    create: {
      name: 'Rahul Kumar',
      email: 'student@tdpclassroom.com',
      passwordHash,
      role: UserRole.STUDENT,
      isEmailVerified: true,
      avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150',
    },
  });
  console.log(`✅ Student seeded: ${student.name} (${student.email})`);

  // 5. Seed Student Membership (STUDENT, ACCEPTED)
  await prisma.institutionMembership.upsert({
    where: {
      institutionId_userId: {
        institutionId: institution.id,
        userId: student.id,
      },
    },
    update: {},
    create: {
      institutionId: institution.id,
      userId: student.id,
      role: InstitutionRole.STUDENT,
      status: MembershipStatus.ACCEPTED,
      acceptedAt: new Date(),
    },
  });
  console.log('✅ Student institution membership seeded (STUDENT, ACCEPTED)');

  // 6. Seed Independent Classroom
  const indClassroom = await prisma.classroom.upsert({
    where: { code: 'TDP101' },
    update: {},
    create: {
      name: 'Web Development Fundamentals',
      code: 'TDP101',
      hostId: teacher.id,
      type: ClassroomType.INDEPENDENT,
      status: ClassroomStatus.ACTIVE,
    },
  });
  console.log(`✅ Independent classroom seeded: ${indClassroom.name} [${indClassroom.code}]`);

  // 7. Seed Institution Classroom
  const instClassroom = await prisma.classroom.upsert({
    where: { code: 'TDP202' },
    update: {},
    create: {
      name: 'Advanced Java Programming',
      code: 'TDP202',
      hostId: teacher.id,
      institutionId: institution.id,
      type: ClassroomType.INSTITUTION,
      status: ClassroomStatus.ACTIVE,
    },
  });
  console.log(`✅ Institution classroom seeded: ${instClassroom.name} [${instClassroom.code}]`);

  // 8. Seed Classroom Participants
  // Host participants
  await prisma.classroomParticipant.upsert({
    where: { classroomId_userId: { classroomId: indClassroom.id, userId: teacher.id } },
    update: {},
    create: {
      classroomId: indClassroom.id,
      userId: teacher.id,
      role: ParticipantRole.HOST,
      status: ParticipantStatus.ACCEPTED,
      joinedAt: new Date(),
    },
  });

  await prisma.classroomParticipant.upsert({
    where: { classroomId_userId: { classroomId: instClassroom.id, userId: teacher.id } },
    update: {},
    create: {
      classroomId: instClassroom.id,
      userId: teacher.id,
      role: ParticipantRole.HOST,
      status: ParticipantStatus.ACCEPTED,
      joinedAt: new Date(),
    },
  });

  // Student participants
  await prisma.classroomParticipant.upsert({
    where: { classroomId_userId: { classroomId: indClassroom.id, userId: student.id } },
    update: {},
    create: {
      classroomId: indClassroom.id,
      userId: student.id,
      role: ParticipantRole.STUDENT,
      status: ParticipantStatus.ACCEPTED,
      joinedAt: new Date(),
    },
  });

  await prisma.classroomParticipant.upsert({
    where: { classroomId_userId: { classroomId: instClassroom.id, userId: student.id } },
    update: {},
    create: {
      classroomId: instClassroom.id,
      userId: student.id,
      role: ParticipantRole.STUDENT,
      status: ParticipantStatus.ACCEPTED,
      joinedAt: new Date(),
    },
  });
  console.log('✅ Classroom participants seeded');

  console.log('🎉 Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
