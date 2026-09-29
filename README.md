# TDP Classroom Lite — Backend

A lightweight, robust, and modular online classroom platform backend built with NestJS, TypeScript, MongoDB Atlas, and Socket.IO.

---

## Table of Contents

- [Features](#features)
- [Technology Stack](#technology-stack)
- [Architecture & Frontend Separation](#architecture--frontend-separation)
- [Folder Structure](#folder-structure)
- [MongoDB Atlas Setup](#mongodb-atlas-setup)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Running the Application](#running-the-application)
- [Swagger API Documentation](#swagger-api-documentation)
- [REST API Endpoints](#rest-api-endpoints)
- [Socket.IO Events](#socketio-events)
- [Authentication Flow](#authentication-flow)
- [Classroom Flow](#classroom-flow)
- [Join Request Flow](#join-request-flow)
- [Whiteboard Flow](#whiteboard-flow)
- [PDF Sharing Flow](#pdf-sharing-flow)
- [WebRTC Screen Sharing Flow](#webrtc-screen-sharing-flow)
- [MongoDB Collections & Indexes](#mongodb-collections--indexes)
- [Testing](#testing)
- [Production Deployment](#production-deployment)

---

## Features

- **User Authentication**: Secure user signup, login, password hashing using bcrypt, and stateless JWT token authentication with Passport.
- **MongoDB Atlas Cloud Database**: Asynchronous connection management via `@nestjs/config` and `@nestjs/mongoose` with automatic connection lifecycle logging.
- **Classroom Management**:
  - Unique 6-character classroom code generation (e.g., `TDP8K2`), filtering out easily confused characters (`O`, `0`, `I`, `1`).
  - Strict host vs. student authorization verified server-side via MongoDB.
  - Student join request workflow (request access, host review, accept or reject).
  - Real-time participant state tracking.
  - End classroom session (rejects future join attempts and notifies connected clients).
- **Real-Time Whiteboard**:
  - Freehand drawing with configurable stroke color and stroke width.
  - Eraser tool.
  - Host-only canvas clear with automatic database cleanup.
  - Whiteboard operations persisted to MongoDB and replayed automatically on client connection.
- **PDF Sharing & Synchronization**:
  - Host shares PDF metadata (file name, URL, total pages).
  - Synchronized page turning pushed to all students in real-time.
  - Host closes the PDF presentation.
  - *No binary storage in MongoDB — lightweight and fast metadata synchronization.*
- **WebRTC Screen Sharing Signaling**:
  - NestJS serves strictly as a signaling server for WebRTC peer-to-peer browser communication.
  - Offers, answers, and ICE candidate exchange between verified classroom participants.
  - Zero media passes through the NestJS server.
- **Security & Reliability**:
  - Helmet HTTP security headers.
  - Strict CORS policy tied to `FRONTEND_URL`.
  - Rate limiting via `@nestjs/throttler` on sensitive authentication and classroom creation routes.
  - Global input validation pipe (`whitelist`, `forbidNonWhitelisted`, `transform`).
  - Standardized JSON responses and centralized HTTP exception filtering.
  - Complete OpenAPI / Swagger 3.0 documentation with JWT Bearer authentication support.

---

## Technology Stack

- **Runtime & Language**: Node.js (LTS), TypeScript (ES2023 / NodeNext)
- **Framework**: NestJS (v12)
- **Database & ODM**: MongoDB Atlas, Mongoose (`@nestjs/mongoose`)
- **Authentication**: Passport, Passport-JWT, `@nestjs/jwt`, `bcrypt`
- **Real-Time & WebSockets**: Socket.IO (`@nestjs/websockets`, `@nestjs/platform-socket.io`)
- **Validation**: `class-validator`, `class-transformer`
- **Security**: `helmet`, `@nestjs/throttler`, CORS
- **Documentation**: Swagger UI (`@nestjs/swagger`, `swagger-ui-express`)
- **Testing**: Vitest, Supertest

---

## Architecture & Frontend Separation

```
+---------------------------------------+
|  React + Vite Frontend (Browser App)  |
+---------------------------------------+
         |                      |
   REST HTTPS               Socket.IO
   (Port 3000)          (/classroom namespace)
         |                      |
         v                      v
+---------------------------------------+
|            NestJS Backend             |
|  - Rate Limiting, Validation, Auth    |
|  - Real-Time Gateway & Signaling      |
+---------------------------------------+
                    |
          MongoDB Native Driver
         (TLS / Connection Pool)
                    |
                    v
+---------------------------------------+
|          MongoDB Atlas Cloud          |
+---------------------------------------+
```

### Security Boundary:
1. **The frontend NEVER connects directly to MongoDB Atlas.**
2. `MONGODB_URI` and `JWT_SECRET` reside solely on the backend inside `.env`.
3. Never include database credentials or server secrets inside React/Vite environment variables (`VITE_*`).
4. All client mutations and state access pass through authenticated REST endpoints or verified Socket.IO events.

---

## Folder Structure

```
src/
├── main.ts                           # Application entry point, Helmet, CORS, Swagger, Global Pipes
├── app.module.ts                     # Root module registering feature modules, Config, Throttler, and Atlas Mongoose
│
├── config/
│   └── configuration.ts              # Strongly-typed environment variables & validation
│
├── common/
│   ├── constants/
│   │   ├── roles.enum.ts             # ParticipantRole (HOST, STUDENT)
│   │   └── statuses.enum.ts          # ClassroomStatus, ParticipantStatus, WhiteboardOperationType
│   ├── filters/
│   │   └── http-exception.filter.ts  # Standardized JSON error response formatting
│   ├── interceptors/
│   │   └── logging.interceptor.ts    # Safe request/response execution logging
│   └── interfaces/
│       ├── api-response.interface.ts # Uniform API response envelope
│       ├── authenticated-user.interface.ts
│       └── jwt-payload.interface.ts
│
├── auth/
│   ├── auth.module.ts                # Auth module configuring Passport and JWT
│   ├── auth.controller.ts            # POST /auth/signup, POST /auth/login
│   ├── auth.service.ts               # Password hashing, user validation, JWT issuance
│   ├── dto/
│   │   ├── signup.dto.ts
│   │   └── login.dto.ts
│   ├── guards/
│   │   └── jwt-auth.guard.ts         # Passport JWT authentication guard
│   ├── strategies/
│   │   └── jwt.strategy.ts           # JWT extraction and validation strategy
│   └── decorators/
│       └── current-user.decorator.ts # @CurrentUser() param decorator
│
├── users/
│   ├── users.module.ts
│   ├── users.controller.ts           # GET /users/me
│   ├── users.service.ts              # User CRUD operations and response sanitization
│   └── schemas/
│       └── user.schema.ts            # Mongoose User schema (email indexed & unique)
│
├── classrooms/
│   ├── classrooms.module.ts
│   ├── classrooms.controller.ts       # Classroom lifecycle, join requests, participant management
│   ├── classrooms.service.ts          # Business logic, state transitions, role verification
│   ├── schemas/
│   │   ├── classroom.schema.ts        # Classroom schema with activePdf subdocument
│   │   └── participant.schema.ts      # Participant schema with compound unique index
│   ├── dto/
│   │   └── create-classroom.dto.ts
│   └── utils/
│       └── classroom-code.generator.ts # Generates unique 6-character codes without ambiguous chars
│
├── realtime/
│   ├── realtime.module.ts
│   ├── classroom.gateway.ts           # Socket.IO gateway (/classroom namespace)
│   └── dto/
│       ├── join-room.dto.ts
│       └── leave-room.dto.ts
│
├── whiteboard/
│   ├── whiteboard.module.ts
│   ├── whiteboard.service.ts          # Whiteboard operations persistence and replay
│   ├── schemas/
│   │   └── whiteboard-operation.schema.ts # Draw and erase operations schema
│   └── dto/
│       ├── whiteboard-draw.dto.ts
│       └── whiteboard-erase.dto.ts
│
├── pdf/
│   ├── pdf.module.ts
│   ├── pdf.service.ts                 # PDF metadata storage and page synchronization
│   └── dto/
│       ├── share-pdf.dto.ts
│       └── page-change.dto.ts
│
├── webrtc/
│   ├── webrtc.module.ts
│   ├── webrtc.service.ts              # Peer-to-peer signaling authorization
│   └── dto/
│       └── webrtc-signal.dto.ts
│
└── health/
    ├── health.module.ts
    └── health.controller.ts           # GET /health with database connection state
```

---

## MongoDB Atlas Setup

This backend is designed to run exclusively with **MongoDB Atlas Cloud**. Local MongoDB installation is **NOT** required.

Follow these 10 steps to connect:

1. **Create MongoDB Atlas Account**: Go to [mongodb.com/atlas](https://www.mongodb.com/atlas) and sign up for a free account.
2. **Create a Project**: Inside your organization, click **New Project** and name it `Classroom-Lite`.
3. **Deploy a Free Cluster**: Click **Create a Database**, select the free shared tier (**M0 Sandbox**), and choose your preferred cloud provider and region.
4. **Create a Database User**:
   - Go to **Security > Database Access**.
   - Click **Add New Database User**.
   - Choose **Password** authentication method.
   - Enter a username (e.g., `classroom_admin`) and a strong password.
   - Assign the **Read and write to any database** built-in role.
5. **Configure Network Access**:
   - Go to **Security > Network Access**.
   - Click **Add IP Address**.
   - For development, select **Allow Access from Anywhere** (`0.0.0.0/0`) or add your current public IP address.
6. **Obtain Connection String**:
   - Go to **Database > Clusters**.
   - Click **Connect** on your cluster.
   - Choose **Drivers** (Node.js).
   - Copy the connection string format:
     ```text
     mongodb+srv://<username>:<password>@<cluster-name>.mongodb.net/?retryWrites=true&w=majority&appName=ClassroomLite
     ```
7. **Add Database Name**:
   - Add `/tdp_classroom_lite` before the query parameter `?`:
     ```text
     mongodb+srv://<username>:<password>@<cluster-name>.mongodb.net/tdp_classroom_lite?retryWrites=true&w=majority&appName=ClassroomLite
     ```
8. **Configure `.env`**:
   - Place your connection string into your local `.env` file under `MONGODB_URI`.
9. **Start the Application**:
   - Run `npm run start:dev`.
10. **Verify MongoDB Connection**:
   - Look for the console log:
     ```
     [Nest] LOG [MongoDBAtlas] MongoDB Atlas connected
     ```
   - Alternatively, open `http://localhost:3000/health` in your browser and verify `"database": "connected"`.

---

## Installation

```bash
# 1. Clone repository
cd Backend

# 2. Install dependencies
npm install

# 3. Create .env file from template
cp .env.example .env
```

---

## Environment Variables

Edit `.env` with your settings:

```env
# Application Port
PORT=3000

# MongoDB Atlas Connection URI
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-url>/tdp_classroom_lite?retryWrites=true&w=majority&appName=ClassroomLite

# JWT Secret and Expiration
JWT_SECRET=replace-with-a-secure-random-secret
JWT_EXPIRES_IN=1d

# Allowed Frontend URL for CORS
FRONTEND_URL=http://localhost:5173
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

---

## Swagger API Documentation

Interactive Swagger documentation is available out of the box:

- **URL**: `http://localhost:3000/api/docs`
- **Authentication**: Click the **Authorize** button in Swagger and paste your JWT token to test protected endpoints directly.

---

## REST API Endpoints

### 1. Health Check
| Method | Route | Description | Auth Required |
|---|---|---|---|
| `GET` | `/health` | Check service health & MongoDB connection status | No |

### 2. Authentication
| Method | Route | Description | Auth Required | Rate Limit |
|---|---|---|---|---|
| `POST` | `/auth/signup` | Register new user account | No | 10 req / min |
| `POST` | `/auth/login` | Log in and receive JWT accessToken | No | 10 req / min |

### 3. Users
| Method | Route | Description | Auth Required |
|---|---|---|---|
| `GET` | `/users/me` | Fetch authenticated user profile | Bearer JWT |

### 4. Classrooms & History Dashboards
| Method | Route | Description | Auth Required | Role |
|---|---|---|---|---|
| `POST` | `/classrooms` | Create a classroom (creator becomes HOST) | Bearer JWT | Any User |
| `GET` | `/classrooms/history/teacher` | **Teacher Dashboard**: List past classrooms, who joined & attendance durations | Bearer JWT | Host |
| `GET` | `/classrooms/history/student` | **Student Dashboard**: List past attended classes & student's attendance time | Bearer JWT | Student |
| `GET` | `/classrooms/:code` | Retrieve classroom details & active PDF metadata | Bearer JWT | Any User |
| `GET` | `/classrooms/:code/history` | Get detailed attendance report for a specific classroom | Bearer JWT | Participant |
| `POST` | `/classrooms/:code/join` | Submit a student join request | Bearer JWT | Student |
| `GET` | `/classrooms/:code/participants` | List accepted participants in the classroom | Bearer JWT | Accepted Users |
| `GET` | `/classrooms/:code/requests` | List pending join requests | Bearer JWT | HOST only |
| `POST` | `/classrooms/:code/requests/:userId/accept` | Accept a student join request | Bearer JWT | HOST only |
| `POST` | `/classrooms/:code/requests/:userId/reject` | Reject a student join request | Bearer JWT | HOST only |
| `POST` | `/classrooms/:code/leave` | Leave classroom session & record departure time | Bearer JWT | Participant |
| `POST` | `/classrooms/:code/end` | End classroom session | Bearer JWT | HOST only |

---

## Socket.IO Events

- **Namespace**: `/classroom`
- **Handshake Authentication**: Send the JWT in `auth: { token: "<accessToken>" }` or `headers: { authorization: "Bearer <accessToken>" }`.

### Client -> Server Events
| Event | Payload | Description | Role Required |
|---|---|---|---|
| `classroom:join` | `{ "classroomCode": "TDP8K2" }` | Join socket room & receive full classroom state | ACCEPTED participant |
| `classroom:leave` | `{ "classroomCode": "TDP8K2" }` | Leave socket room | Any |
| `whiteboard:draw` | `{ "x1": 10, "y1": 10, "x2": 20, "y2": 20, "color": "#000", "width": 3 }` | Draw stroke on canvas | ACCEPTED participant |
| `whiteboard:erase` | `{ "x1": 10, "y1": 10, "x2": 20, "y2": 20, "width": 20 }` | Erase path on canvas | ACCEPTED participant |
| `whiteboard:clear` | *(empty)* | Clear whiteboard operations | HOST only |
| `whiteboard:state` | *(empty)* | Request current whiteboard operations list | ACCEPTED participant |
| `pdf:share` | `{ "fileName": "notes.pdf", "fileUrl": "https://...", "totalPages": 40 }` | Share PDF presentation | HOST only |
| `pdf:page-change` | `{ "page": 5 }` | Change active page | HOST only |
| `pdf:close` | *(empty)* | Close active PDF presentation | HOST only |
| `webrtc:offer` | `{ "targetUserId": "...", "data": <SDP> }` | Send WebRTC offer | Same classroom participant |
| `webrtc:answer` | `{ "targetUserId": "...", "data": <SDP> }` | Send WebRTC answer | Same classroom participant |
| `webrtc:ice-candidate` | `{ "targetUserId": "...", "data": <Candidate> }` | Send ICE candidate | Same classroom participant |

### Server -> Client Events
| Event | Payload | Recipient |
|---|---|---|
| `classroom:state` | `{ classroom, participants, activePdf, whiteboard }` | Client joining room |
| `classroom:user-joined` | `{ userId, name, role }` | Classroom room |
| `classroom:user-left` | `{ userId, name }` | Classroom room |
| `classroom:request:new` | `{ userId, name, email, classroomCode }` | Host private socket |
| `classroom:request:accepted` | `{ classroomCode, status: "ACCEPTED" }` | Student private socket |
| `classroom:request:rejected` | `{ classroomCode, status: "REJECTED" }` | Student private socket |
| `classroom:participant-updated`| `{ userId, name, email, role, status, joinedAt }` | Classroom room |
| `classroom:ended` | `{ classroomCode, endedAt }` | Classroom room |
| `whiteboard:draw` | `{ id, userId, type, x1, y1, x2, y2, color, width, createdAt }` | Classroom room |
| `whiteboard:erase` | `{ id, userId, type, x1, y1, x2, y2, width, createdAt }` | Classroom room |
| `whiteboard:cleared` | `{ clearedBy, timestamp }` | Classroom room |
| `whiteboard:state` | `{ operations: [...] }` | Requesting client |
| `pdf:shared` | `{ fileName, fileUrl, totalPages, currentPage }` | Classroom room |
| `pdf:page-changed` | `{ page }` | Classroom room |
| `pdf:closed` | `{ timestamp }` | Classroom room |
| `webrtc:offer` | `{ senderUserId, data }` | Target user socket |
| `webrtc:answer` | `{ senderUserId, data }` | Target user socket |
| `webrtc:ice-candidate` | `{ senderUserId, data }` | Target user socket |

---

## Authentication Flow

1. User sends credentials to `POST /auth/signup` or `POST /auth/login`.
2. Passwords are encrypted/verified via `bcrypt` (10 rounds).
3. On success, an `accessToken` is returned with payload `{ sub: userId, email }`.
4. The client includes `Authorization: Bearer <accessToken>` on all protected REST requests and passes the token in `auth.token` when establishing the Socket.IO connection.

---

## Classroom Flow

1. **Host Creates Classroom**: `POST /classrooms` with `{ "name": "Java Programming" }`.
2. Backend generates a 6-character code (e.g. `TDP8K2`) and creates a `Participant` record with `role: "HOST"` and `status: "ACCEPTED"`.
3. Host receives classroom details and joins the Socket.IO room `classroom:TDP8K2`.

---

## Join Request Flow

1. **Student Requests Join**: Student sends `POST /classrooms/TDP8K2/join`.
2. Backend creates `Participant` record with `role: "STUDENT"` and `status: "REQUESTED"`.
3. Backend sends a real-time event `classroom:request:new` directly to the host's connected socket.
4. **Host Reviews Requests**: Host calls `GET /classrooms/TDP8K2/requests`.
5. **Host Accepts or Rejects**:
   - `POST /classrooms/TDP8K2/requests/:userId/accept`: Status becomes `ACCEPTED`. Backend emits `classroom:request:accepted` to student and broadcasts `classroom:participant-updated` to the room.
   - `POST /classrooms/TDP8K2/requests/:userId/reject`: Status becomes `REJECTED`. Backend emits `classroom:request:rejected` to student.
6. Once accepted, the student sends `classroom:join` via Socket.IO and receives the full synchronized `classroom:state`.

---

## Whiteboard Flow

1. Any accepted participant draws or erases on the Canvas.
2. Client emits `whiteboard:draw` or `whiteboard:erase` via Socket.IO.
3. Gateway verifies that the participant is accepted and classroom is active, stores the operation in MongoDB, and broadcasts it to everyone in `classroom:<code'>`.
4. When a student joins late, the backend sends all saved operations inside `classroom:state`, allowing instant Canvas replay.
5. Only the host can emit `whiteboard:clear` which clears the database records and resets the canvas for all users.

---

## PDF Sharing Flow

1. Host emits `pdf:share` with `{ fileName, fileUrl, totalPages }`.
2. Backend saves metadata into `Classroom.activePdf` with `currentPage = 1` and broadcasts `pdf:shared`.
3. When the host flips a page, client emits `pdf:page-change` with `{ page: N }`.
4. Backend validates `1 <= page <= totalPages`, updates `activePdf.currentPage`, and broadcasts `pdf:page-changed`.
5. When presentation ends, host emits `pdf:close`, setting `activePdf = null`.

---

## WebRTC Screen Sharing Flow

1. User A wishes to share their screen. Browser captures `navigator.mediaDevices.getDisplayMedia()`.
2. For each peer in the classroom, User A creates an RTCPeerConnection and creates an offer.
3. User A emits `webrtc:offer` with `{ targetUserId: B, data: offerSDP }`.
4. NestJS validates both A and B are accepted members of the classroom, then forwards the offer to User B.
5. User B receives the offer, sets remote description, creates an answer, and emits `webrtc:answer` with `{ targetUserId: A, data: answerSDP }`.
6. NestJS forwards the answer back to User A.
7. Both peers exchange ICE candidates via `webrtc:ice-candidate`.
8. Direct peer-to-peer screen stream begins between browsers without passing through NestJS!

---

## Inactivity Auto-Ending & Dashboard History

### 1. Inactivity Detection & Automatic Room Closure
- **0 Active Participants**: When the last participant exits the Socket.IO classroom room or disconnects, an inactivity grace timer (60 seconds) is started.
- **Auto-Ending**: If no participant rejoins before the timer expires, the backend automatically ends the session:
  - `status` is transitioned to `"ENDED"`.
  - `endedReason` is set to `"INACTIVITY"`.
  - `endedAt` timestamp is recorded.
  - Sockets receive a final `classroom:ended` broadcast notification.
- **Automatic Duration Finalization**: All participants' `leftAt` timestamps and total attendance durations (`durationSeconds`) are finalized.

### 2. Teacher Dashboard (`GET /classrooms/history/teacher`)
- Lists all classrooms created by the teacher.
- Includes total class duration and session status (`ACTIVE` vs `ENDED`).
- Detailed breakdown of all students who joined:
  - Student identity (`userId`, `name`, `email`, `avatar`)
  - Timestamp when they joined (`joinedAt`) and left (`leftAt`)
  - Time spent in class in seconds and human-readable format (`durationFormatted` e.g., `"45m 20s"`).

### 3. Student Dashboard (`GET /classrooms/history/student`)
- Lists all past classes the student attended.
- Displays classroom name, code, teacher/host profile, and total session duration.
- Shows individual attendance metrics:
  - Exact join time and departure time
  - Duration spent in class (`durationFormatted` e.g., `"30m"`)
  - Total classmates in session.

---

## MongoDB Collections & Indexes

### `users`
- `email`: String (required, unique, lowercase, trimmed, indexed)
- `name`: String (required)
- `passwordHash`: String (required)
- `avatar`: String (optional)
- *Timestamps enabled*

### `classrooms`
- `code`: String (required, unique, uppercase, 6 chars, indexed)
- `name`: String (required)
- `hostId`: ObjectId (ref: User, indexed)
- `status`: String (`"ACTIVE"` | `"ENDED"`, indexed)
- `activePdf`: Object (`fileName`, `fileUrl`, `totalPages`, `currentPage`)
- `endedAt`: Date (optional)
- *Timestamps enabled*

### `participants`
- `classroomId`: ObjectId (ref: Classroom, indexed)
- `userId`: ObjectId (ref: User, indexed)
- `role`: String (`"HOST"` | `"STUDENT"`)
- `status`: String (`"REQUESTED"` | `"ACCEPTED"` | `"REJECTED"` | `"LEFT"`)
- `joinedAt`: Date (optional)
- **Unique compound index**: `{ classroomId: 1, userId: 1 }` prevents duplicate membership records.

### `whiteboardoperations`
- `classroomId`: ObjectId (ref: Classroom, indexed)
- `userId`: ObjectId (ref: User)
- `type`: String (`"DRAW"` | `"ERASE"`)
- `x1`, `y1`, `x2`, `y2`: Numbers
- `color`: String
- `width`: Number
- **Compound index**: `{ classroomId: 1, createdAt: 1 }` optimizes chronological replay.

---

## Testing

```bash
# Run all unit tests
npm test

# Run all end-to-end (e2e) tests
npm run test:e2e

# Run both unit and e2e tests
npm test && npm run test:e2e
```

---

## Production Deployment

1. Set `NODE_ENV=production`.
2. Configure environment variables in your cloud hosting provider (AWS, GCP, Railway, Render, etc.):
   - `PORT=3000`
   - `MONGODB_URI=<Your MongoDB Atlas connection string>`
   - `JWT_SECRET=<Strong random string>`
   - `JWT_EXPIRES_IN=1d`
   - `FRONTEND_URL=<Production URL of React app>`
3. Build and launch:
   ```bash
   npm run build
   npm run start:prod
   ```
