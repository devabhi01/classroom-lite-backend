# TDP Classroom Lite — Backend

A lightweight, enterprise-grade, and modular online classroom platform backend built with **NestJS**, **TypeScript**, **PostgreSQL**, **Prisma ORM**, **Neon Cloud Database**, and **Socket.IO**.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Architecture & Relational Data Model](#architecture--relational-data-model)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Folder Structure](#folder-structure)
- [Neon Cloud PostgreSQL Setup](#neon-cloud-postgresql-setup)
- [Prisma Setup & Migrations](#prisma-setup--migrations)
- [Installation & Environment Configuration](#installation--environment-configuration)
- [Running the Application](#running-the-application)
- [Swagger API Documentation](#swagger-api-documentation)
- [REST API Endpoints](#rest-api-endpoints)
- [Socket.IO Events (/classroom)](#socketio-events-classroom)
- [Authentication & Registration Flows](#authentication--registration-flows)
  - [Teacher Signup (Create Institution vs Join Existing)](#teacher-signup)
  - [Student Signup (Multi-Institution Selection)](#student-signup)
- [Institution System & Administration](#institution-system--administration)
- [Classroom Architecture (Independent vs Institution)](#classroom-architecture)
- [Whiteboard Synchronization](#whiteboard-synchronization)
- [PDF Sharing & Annotation](#pdf-sharing--annotation)
- [WebRTC Signaling](#webrtc-signaling)
- [Testing](#testing)
- [Production Deployment](#production-deployment)

---

## Project Overview

**TDP Classroom Lite** provides a scalable backend for virtual classrooms. It connects teachers and students through real-time interactive classrooms with live whiteboards, synchronized PDF presentations, and WebRTC peer-to-peer audio/video/screen sharing.

The backend has been migrated from MongoDB/Mongoose to **PostgreSQL with Prisma ORM**, deployed on **Neon Serverless PostgreSQL**, featuring a multi-tenant **Institution & Membership Management System**.

---

## Architecture & Relational Data Model

The PostgreSQL database enforces relational integrity with UUID primary keys, foreign key constraints (`CASCADE` / `RESTRICT` / `SET NULL`), unique compound constraints, and performance indexes.

```
USER
  │
  ├──< INSTITUTION_MEMBERSHIP >── INSTITUTION
  │                                  │
  │                                  └──< CLASSROOM
  │
  └──< CLASSROOM_PARTICIPANT >───── CLASSROOM
                                     │
                                     └──< WHITEBOARD_OPERATION
```

### Relational Rules:
- **One User → Many Institutions**: A single user account can join multiple institutions with independent roles and statuses.
- **One Institution → Many Users**: Institutions have an `OWNER`, optional `ADMIN`s, `TEACHER`s, and `STUDENT`s.
- **Separate Membership Domains**: Institution membership is decoupled from classroom membership. A student enrolled in an institution is not automatically enrolled in all classrooms; they request to join specific classrooms.
- **Classroom Types**:
  - `INDEPENDENT`: Created directly by any teacher without requiring an institution.
  - `INSTITUTION`: Linked to an institution; only teachers with an `ACCEPTED` membership in that institution can create it, and only accepted student members can join it.

---

## Features

- **Authentication & JWT**:
  - Secure signup and login with bcrypt password hashing (10 salt rounds).
  - Stateless JWT authentication via Passport JWT strategy.
  - Role-based access control (`TEACHER`, `STUDENT`).
- **Institution System**:
  - Teachers can create their own institution (becoming `OWNER`) or request to join an existing one.
  - Students can request to join one or multiple institutions during signup or later via code (`TDP82K4`).
  - Institution owner and administrators can manage requests (accept, reject), remove members, and view institution analytics.
- **Classroom Management**:
  - 6-character unique classroom code generation (e.g., `TDP8K2`).
  - Host/student roles and request-to-join approval queue.
  - Inactivity detection and auto-termination.
  - Detailed historical analytics for teachers and students with duration formatting.
- **Real-Time Interactive Whiteboard**:
  - Freehand drawing and eraser tools via Socket.IO `/classroom`.
  - Operations stored in PostgreSQL and replayed upon joining.
  - Host-only canvas clearing with database cleanup.
- **Synchronized PDF Presentations**:
  - PDF upload with size and MIME validation.
  - Real-time slide turning and page synchronization across all clients.
  - Real-time pen and eraser annotations over PDF pages.
- **WebRTC Signaling**:
  - Socket.IO signaling relay for peer-to-peer screen sharing and voice/video chat.
  - No media passes through NestJS; media flows directly peer-to-peer.
- **Security & Reliability**:
  - Helmet HTTP security headers.
  - Rate limiting via `@nestjs/throttler`.
  - Input validation using `class-validator` and `class-transformer`.
  - System health checks reflecting live PostgreSQL connectivity.

---

## Technology Stack

- **Framework**: [NestJS](https://nestjs.com/) (Node.js ESM)
- **Language**: TypeScript (strict mode, target ES2023)
- **Database**: PostgreSQL (Hosted on [Neon](https://neon.tech/))
- **ORM**: [Prisma ORM](https://www.prisma.io/) v6
- **Real-time WebSockets**: [Socket.IO](https://socket.io/)
- **Authentication**: Passport.js & JWT (`@nestjs/jwt`, `passport-jwt`, `bcrypt`)
- **Documentation**: Swagger UI (`@nestjs/swagger`)
- **Testing**: Vitest, Supertest

---

## Folder Structure

```
Backend/
├── prisma/
│   ├── schema.prisma        # Database schema definitions and enums
│   └── seed.ts              # Development seed script
├── src/
│   ├── auth/                # Authentication, signup flows, JWT strategy
│   ├── classrooms/          # Classroom CRUD, participation, history
│   ├── common/              # Utilities, decorators, filters, interfaces
│   ├── config/              # App configuration & environment validation
│   ├── health/              # System health & PostgreSQL ping check
│   ├── institutions/        # Multi-institution management, requests, stats
│   ├── pdf/                 # PDF upload, sharing, slide synchronization
│   ├── prisma/              # PrismaService and global PrismaModule
│   ├── realtime/            # Socket.IO Gateway (/classroom namespace)
│   ├── users/               # User profiles and queries
│   ├── webrtc/              # WebRTC signaling verification
│   ├── whiteboard/          # Canvas draw/erase operations
│   ├── app.module.ts        # Root NestJS application module
│   └── main.ts              # Application bootstrap & middleware
├── test/
│   └── app.e2e-spec.ts      # End-to-end integration test suite
├── .env.example             # Example environment variables
├── package.json             # NPM dependencies and scripts
└── tsconfig.json            # NodeNext TypeScript configuration
```

---

## Neon Cloud PostgreSQL Setup

1. **Create an Account**: Go to [neon.tech](https://neon.tech/) and sign up.
2. **Create a Project**:
   - Project Name: `tdp-classroom-lite`
   - Region: Select the region nearest to your users.
3. **Copy the Connection String**:
   - In your Neon dashboard, copy the PostgreSQL connection string.
   - Example:
     ```
     DATABASE_URL="postgresql://user:password@ep-cool-fog-123456.us-east-2.aws.neon.tech/neondb?sslmode=require"
     ```
4. **Configure `.env`**:
   - Create or update `.env` in the `Backend` directory:
     ```env
     PORT=3000
     DATABASE_URL="postgresql://user:password@ep-cool-fog-123456.us-east-2.aws.neon.tech/neondb?sslmode=require"
     JWT_SECRET="tdp-classroom-lite-jwt-secret-key-2025"
     JWT_EXPIRES_IN="1d"
     FRONTEND_URL="http://localhost:5173"
     ```

---

## Prisma Setup & Migrations

### 1. Generate Prisma Client
```bash
npx prisma generate
```

### 2. Apply Migrations (Development)
```bash
npx prisma migrate dev --name init_neon_postgres
```

### 3. Apply Migrations (Production)
```bash
npx prisma migrate deploy
```

### 4. Seed Development Data
```bash
npm run prisma:seed
```

### 5. Inspect Database with Prisma Studio
```bash
npx prisma studio
```

---

## Installation & Environment Configuration

```bash
# 1. Clone repository and navigate to Backend
cd "Backend"

# 2. Install dependencies
npm install

# 3. Copy environment template
cp .env.example .env

# 4. Fill in your DATABASE_URL in .env
```

---

## Running the Application

```bash
# Development mode with hot reload
npm run start:dev

# Production build
npm run build

# Start production server
npm run start:prod
```

The server starts at `http://localhost:3000`.

---

## Swagger API Documentation

Interactive API documentation with Bearer token authentication is available at:
**`http://localhost:3000/api/docs`**

---

## REST API Endpoints

### Authentication
- `POST /auth/signup` — Register user (Student or Teacher) with optional institution setups
- `POST /auth/login` — Authenticate and receive JWT access token

### Users
- `GET /users/me` — Get authenticated user profile

### Institutions
- `POST /institutions` — Create a new institution (Teacher only; becomes OWNER)
- `GET /institutions/search?q=:query` — Search institutions by name or code (Public info: id, name, code, logo)
- `GET /institutions/my` — Get all accepted institutions of the current user
- `GET /institutions/:id` — Get institution details (Authorized members/owner only)
- `PATCH /institutions/:id` — Update institution details (Owner or Admin only)
- `POST /institutions/:id/join` — Request to join institution by ID
- `POST /institutions/join-by-code` — Request to join institution by code (e.g. `TDP82K4`)
- `GET /institutions/:id/members` — View accepted members (Supports `?role=TEACHER` or `?role=STUDENT`)
- `GET /institutions/:id/requests` — View pending join requests (Owner or Admin only)
- `POST /institutions/:id/requests/:userId/accept` — Accept member join request (Owner or Admin only)
- `POST /institutions/:id/requests/:userId/reject` — Reject member join request (Owner or Admin only)
- `DELETE /institutions/:id/members/:userId` — Remove member (Owner or Admin only; Owner cannot be removed)
- `POST /institutions/:id/leave` — Leave an institution (Owner cannot leave)
- `GET /institutions/:id/stats` — Get analytics (`teachers`, `students`, `totalMembers`)

### Classrooms
- `POST /classrooms` — Create a classroom (`INDEPENDENT` or `INSTITUTION`)
- `GET /classrooms/:code` — Get classroom information
- `POST /classrooms/:code/join` — Request to join classroom (requires accepted institution membership for `INSTITUTION` classrooms)
- `GET /classrooms/:code/participants` — Get accepted participants
- `GET /classrooms/:code/requests` — View student join requests (Host only)
- `POST /classrooms/:code/requests/:userId/accept` — Accept student join request (Host only)
- `POST /classrooms/:code/requests/:userId/reject` — Reject student join request (Host only)
- `POST /classrooms/:code/leave` — Leave classroom
- `POST /classrooms/:code/end` — End classroom session (Host only)
- `GET /classrooms/history/teacher` — Teacher classroom history with attendance duration
- `GET /classrooms/history/student` — Student attended classes history
- `GET /classrooms/:code/history` — Detailed session report for a classroom

### PDF
- `POST /pdf/upload` — Upload PDF presentation file

### Health
- `GET /health` — Check system status and live PostgreSQL connectivity

---

## Socket.IO Events (/classroom)

Connected clients connect to namespace `/classroom` with a valid JWT token (`auth.token` or `Authorization: Bearer <token>`).

### Client → Server Events
- `classroom:join` `{ classroomCode }` — Join classroom room after request acceptance
- `classroom:leave` `{ classroomCode }` — Leave classroom
- `classroom:request:status` `{ classroomCode }` — Check status of join request
- `whiteboard:draw` `{ x1, y1, x2, y2, color, width }` — Send drawing stroke
- `whiteboard:erase` `{ x1, y1, x2, y2, width }` — Send eraser stroke
- `whiteboard:clear` `{}` — Clear canvas (Host only)
- `whiteboard:state` `{}` — Request complete whiteboard history
- `pdf:share` `{ classroomCode, fileName, fileUrl, totalPages }` — Share PDF presentation (Host only)
- `pdf:page-change` `{ classroomCode, page }` — Change active slide (Host only)
- `pdf:close` `{ classroomCode }` — Close PDF presentation (Host only)
- `pdf:annotate` `{ ... }` — PDF drawing annotation
- `pdf:erase` `{ ... }` — PDF annotation eraser
- `webrtc:offer` `{ targetUserId, offer }` — WebRTC signaling offer
- `webrtc:answer` `{ targetUserId, answer }` — WebRTC signaling answer
- `webrtc:ice-candidate` `{ targetUserId, candidate }` — WebRTC ICE candidate
- `screenshare:started` `{ classroomCode }` — Host started screen share
- `screenshare:stopped` `{ classroomCode }` — Host stopped screen share
- `voicechat:joined`, `voicechat:left`, `voicechat:offer`, `voicechat:answer`, `voicechat:ice-candidate`, `voicechat:mute-state` — Peer-to-peer voice/video mesh

### Server → Client Events
- `classroom:state` — Full initial snapshot (classroom metadata, participants, active PDF, whiteboard strokes)
- `classroom:user-joined` — Emitted when a participant joins
- `classroom:user-left` — Emitted when a participant disconnects or leaves
- `classroom:request:new` — Emitted to Host when a student requests to join
- `classroom:request:accepted` — Emitted directly to student when approved
- `classroom:request:rejected` — Emitted directly to student when rejected
- `classroom:ended` — Emitted to all participants when class ends
- `whiteboard:draw` — Broadcast stroke to room
- `whiteboard:erase` — Broadcast eraser stroke to room
- `whiteboard:cleared` — Broadcast canvas clear to room
- `pdf:shared` — Broadcast active PDF metadata
- `pdf:page-changed` — Broadcast new slide page number
- `pdf:closed` — Broadcast PDF closed
- `institution:request:new` — Emitted to institution owner/admins on new join request
- `institution:member:accepted` — Emitted to user when approved in an institution
- `institution:member:rejected` — Emitted to user when rejected in an institution
- `institution:member:removed` — Emitted to user when removed from an institution

---

## Authentication & Registration Flows

### Teacher Signup
Teachers have two signup options:
1. **Create their own institution**:
   - Provide `name`, `email`, `password`, `role = TEACHER`, and `institutionName`.
   - In a single Prisma database transaction, the system generates a unique uppercase code (e.g., `TDP82K4`), creates the `User`, the `Institution`, and an `InstitutionMembership` with `role = OWNER` and `status = ACCEPTED`.
   - The teacher can immediately create classrooms under their institution.
2. **Join an existing institution**:
   - Provide `name`, `email`, `password`, `role = TEACHER`, and `institutionId` (or `institutionCode`).
   - The system creates the `User` and an `InstitutionMembership` with `role = TEACHER` and `status = REQUESTED`. The institution owner/admin must accept the request.

### Student Signup
Students register with `role = STUDENT`:
- **Optional multi-institution selection**: During signup, students can provide an array of `institutionIds: string[]`.
- For each selected institution, an `InstitutionMembership` record is created with `status = REQUESTED`.
- Students can also register without any institution and join later using an institution code (`POST /institutions/join-by-code`).

---

## Testing

```bash
# Run all unit tests
npm test

# Run e2e tests
npm run test:e2e

# Run with test coverage
npm run test:cov
```

---

## Production Deployment

1. Set `DATABASE_URL` pointing to your production Neon PostgreSQL database with SSL enabled (`?sslmode=require`).
2. Run database migrations:
   ```bash
   npx prisma migrate deploy
   ```
3. Set secure environment variables (`JWT_SECRET`, `FRONTEND_URL`, `PORT`).
4. Build and start:
   ```bash
   npm run build
   npm run start:prod
   ```
