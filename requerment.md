# SkillBridge — Backend Requirements Specification (`requirements.md`)

---

## 1. Overview

**SkillBridge** (*"Connect with Expert Tutors, Learn Anything"*) is a full-stack tutoring marketplace backend API. It connects learners (**Students**) with subject-matter experts (**Tutors**), while enabling platform administrators (**Admins**) to moderate users, oversee bookings, and manage subject categories.

The backend serves as a RESTful API built on **Express.js**, **Better Auth**, and **Prisma ORM (v7)** on **Bun / Node.js**, responsible for:
* User authentication, session management, and mandatory email verification via **Better Auth + Nodemailer**.
* Role-Based Access Control (RBAC) and account status enforcement (`ACTIVE` vs. `BANNED`) across `STUDENT`, `TUTOR`, and `ADMIN` roles.
* Public tutor discovery with multi-criteria search, filtering, sorting, and pagination.
* Tutor profile management and weekly availability slot configuration.
* Instant session booking with availability and double-booking conflict prevention.
* Booking lifecycle transitions (`CONFIRMED` -> `COMPLETED` or `CANCELLED`).
* Verified post-session student reviews and automatic tutor rating recalculation.
* Administrative moderation (user ban/unban, category CRUD, platform analytics).

---

## 2. Tech Stack

* **Runtime & Package Manager:** Bun (`v1.4+`) / Node.js (`v20+`) with TypeScript
* **Web Framework:** Express.js
* **Authentication & Session Management:** Better Auth (`better-auth`, `better-auth/adapters/prisma`, `better-auth/node`)
* **Email Service:** Nodemailer (`SMTP` via Gmail / `SMTP_USER` & `SMTP_PASS`)
* **Database:** PostgreSQL (`skillbridge` database)
* **ORM:** Prisma ORM v7 (`prisma7.config.ts`, `@prisma/client`, `prisma`)
* **Validation:** Zod (request body, query params, and route parameter validation)

---

## 3. Core Project Rules

### 3.1 Authentication, Email Verification & Account Rules
1. **Better Auth Integration:** Authentication (`/api/auth/*`) is handled by Better Auth (`toNodeHandler(auth)`), configured with `emailAndPassword.enabled = true`, `autoSignIn = false`, and `requireEmailVerification = true`.
2. **Mandatory Email Verification:** Upon sign-up (`sendOnSignUp: true`), Nodemailer sends an HTML verification link (`${APP_URL}/verify-email?token=${token}`). Users cannot sign in until their email is verified (`autoSignInAfterVerification: true`).
3. **Self-Registration Roles:** Public sign-up allows only `"STUDENT"` (default) or `"TUTOR"`. Users cannot register as `"ADMIN"` via public endpoints (`403 Forbidden` / `400 Bad Request`).
4. **Admin Seeding:** Admin accounts are created exclusively via the database seed script (`prisma/seed.ts`) with `role: "ADMIN"`, `status: "ACTIVE"`, and `emailVerified: true`.
5. **Banned User Enforcement:** If an `ADMIN` updates a user's `status` to `"BANNED"`:
   * Any authenticated request from that user must be rejected by the `auth(...)` middleware with `403 Forbidden`.
   * Admins cannot ban their own account.

### 3.2 Tutor Profile & Availability Rules
6. **Tutor Profile Setup:** Tutors manage their extended profile (`categoryId`, `headline`, `bio`, `hourlyRate`, `experienceYears`, `subjects`) via `PUT /api/tutor/profile`.
7. **Public Visibility:** `GET /api/tutors` returns only tutors whose linked `User.status === "ACTIVE"` and who have a valid `TutorProfile`.
8. **Availability Slots:** Stored as structured JSON (`[{ "day": "Monday", "startTime": "09:00", "endTime": "17:00" }]`) in 24-hour `HH:mm` format, where `startTime < endTime`.

### 3.3 Booking & Scheduling Rules
9. **Instant Confirmation:** Valid new bookings are created immediately with `status: "CONFIRMED"` (no manual approval step).
10. **Self-Booking Prevention:** A user cannot book their own tutor profile (`studentId !== tutorProfile.userId`).
11. **Availability & Double-Booking Validation:**
    * The requested `sessionDate`, `startTime`, and `endTime` must fall within the tutor's configured `availability` for that day of the week.
    * Reject with `409 Conflict` if the requested slot overlaps with any existing `CONFIRMED` booking for that tutor on the same `sessionDate`.
12. **Server-Side Price Calculation:** `totalPrice` is calculated strictly on the backend (`tutorProfile.hourlyRate * durationInHours`).
13. **Booking State Transitions:**
    * `CONFIRMED` -> `COMPLETED`: Allowed **only** by the assigned `TUTOR` (or `ADMIN`).
    * `CONFIRMED` -> `CANCELLED`: Allowed **only** by the `STUDENT` who created the booking (or `ADMIN`).
    * Once `COMPLETED` or `CANCELLED`, status cannot be changed again (`400 Bad Request`).

### 3.4 Review & Rating Rules
14. **Review Eligibility:** A `STUDENT` can submit a review (`POST /api/reviews`) **only if**:
    * They own the referenced `bookingId` (`booking.studentId === req.user.id`).
    * The booking status is `COMPLETED`.
    * No review exists yet for that `bookingId` (1 review per booking).
15. **Atomic Rating Aggregation:** Creating a review runs inside a `prisma.$transaction(...)` that inserts the `Review` and updates `TutorProfile.averageRating` and `TutorProfile.totalReviews`.

---

## 4. Database Schema (Prisma Models)

> ⚠️ **Important Migration Rule:** Keep Better Auth's core model names (`User` -> table `user`, `Session` -> `session`, `Account` -> `account`, `Verification` -> `verification`) intact without renaming `model User` to `Users` or mapping it away from `user`, so existing user rows and Better Auth sessions are never dropped during `bunx prisma migrate dev`.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  STUDENT
  TUTOR
  ADMIN
}

enum UserStatus {
  ACTIVE
  BANNED
}

enum BookingStatus {
  CONFIRMED
  COMPLETED
  CANCELLED
}

model User {
  id            String     @id
  name          String
  email         String     @unique
  emailVerified Boolean    @default(false)
  image         String?
  role          String     @default("STUDENT") 
  phone         String?
  status        String     @default("ACTIVE")
  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt

  sessions Session[]
  accounts Account[]

  tutorProfile    TutorProfile?
  studentBookings Booking[]     @relation("StudentBookings")
  reviews         Review[]

  @@map("user")
}

model Session {
  id        String   @id
  expiresAt DateTime
  token     String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  ipAddress String?
  userAgent String?
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("session")
}

model Account {
  id                    String    @id
  accountId             String
  providerId            String
  userId                String
  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  accessToken           String?
  refreshToken          String?
  idToken               String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  password              String?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  @@map("account")
}

model Verification {
  id         String   @id
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@map("verification")
}

model Category {
  id          String   @id @default(uuid())
  name        String   @unique
  slug        String   @unique
  description String?
  icon        String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  tutors TutorProfile[]

  @@map("categories")
}

model TutorProfile {
  id              String   @id @default(uuid())
  userId          String   @unique
  categoryId      String
  headline        String
  bio             String   @db.Text
  hourlyRate      Float
  experienceYears Int      @default(0)
  subjects        String[]
  availability    Json     @default("[]")
  averageRating   Float    @default(0.0)
  totalReviews    Int      @default(0)
  isFeatured      Boolean  @default(false)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  user     User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  category Category  @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  bookings Booking[] @relation("TutorBookings")
  reviews  Review[]

  @@index([categoryId])
  @@index([hourlyRate])
  @@index([averageRating])
  @@map("tutor_profiles")
}

model Booking {
  id          String        @id @default(uuid())
  studentId   String
  tutorId     String
  subject     String
  sessionDate DateTime      @db.Date
  startTime   String        
  endTime     String      
  totalPrice  Float
  status      BookingStatus @default(CONFIRMED)
  notes       String?       @db.Text
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  student User         @relation("StudentBookings", fields: [studentId], references: [id], onDelete: Cascade)
  tutor   TutorProfile @relation("TutorBookings", fields: [tutorId], references: [id], onDelete: Cascade)
  review  Review?

  @@index([studentId])
  @@index([tutorId, sessionDate, status])
  @@map("bookings")
}

model Review {
  id        String   @id @default(uuid())
  bookingId String   @unique
  studentId String
  tutorId   String
  rating    Int     
  comment   String   @db.Text
  createdAt DateTime @default(now())

  booking Booking      @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  student User         @relation(fields: [studentId], references: [id], onDelete: Cascade)
  tutor   TutorProfile @relation(fields: [tutorId], references: [id], onDelete: Cascade)

  @@index([tutorId])
  @@map("reviews")
}
```

---

## 5. API Endpoints

### 5.1 Authentication & User Profile (Better Auth + User Helpers)

| Method | Endpoint | Auth | Role | Description |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/sign-up/email` | Public | Any (`STUDENT`/`TUTOR`) | Handled by Better Auth. Creates user & triggers verification email via Nodemailer. |
| `POST` | `/api/auth/sign-in/email` | Public | Any | Handled by Better Auth. Requires verified email; returns session cookie/token. |
| `GET` | `/api/auth/verify-email` | Public | Any | Handled by Better Auth. Verifies email token and auto-signs in user. |
| `GET` | `/api/auth/get-session` | Public/Session | Any | Handled by Better Auth. Returns current session and user object. |
| `POST` | `/api/auth/sign-out` | Required | Any | Handled by Better Auth. Invalidates active session. |
| `GET` | `/api/users/me` | Required | `STUDENT`, `TUTOR`, `ADMIN` | Returns full current user record including `tutorProfile` (if `TUTOR`). |
| `PATCH` | `/api/users/profile` | Required | `STUDENT`, `TUTOR`, `ADMIN` | Update common user fields (`name`, `phone`, `image`). |

---

### 5.2 Tutors & Categories (Public Discovery)

| Method | Endpoint | Auth | Role | Description |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/tutors` | Public | Public | List active tutors with search, filters, sorting, and pagination. |
| `GET` | `/api/tutors/:id` | Public | Public | Get full tutor profile by `TutorProfile.id`, including `user`, `category`, `availability`, and `reviews`. |
| `GET` | `/api/categories` | Public | Public | Retrieve all subject categories. |

**Supported Query Parameters for `GET /api/tutors`:**
* `search` (string): Case-insensitive match against `user.name`, `headline`, `bio`, or `subjects`.
* `category` (string): Filter by `categoryId` or `category.slug`.
* `minPrice` / `maxPrice` (number): Filter by `hourlyRate` range.
* `minRating` (number): Filter by `averageRating >= minRating`.
* `featured` (boolean): When `true`, return featured tutors for the landing page.
* `sortBy` (string): `price_asc` | `price_desc` | `rating_desc` | `newest`.
* `page` (number, default: `1`) & `limit` (number, default: `10`).

---

### 5.3 Tutor Management

| Method | Endpoint | Auth | Role | Description |
| :--- | :--- | :--- | :--- | :--- |
| `PUT` | `/api/tutor/profile` | Required | `TUTOR` | Create or update the authenticated tutor's profile (`categoryId`, `headline`, `bio`, `hourlyRate`, `experienceYears`, `subjects`). |
| `PUT` | `/api/tutor/availability` | Required | `TUTOR` | Set or replace weekly availability time slots. |
| `GET` | `/api/tutor/dashboard` | Required | `TUTOR` | Retrieve tutor stats (total sessions, completed sessions, upcoming sessions, total earnings, average rating). |

---

### 5.4 Bookings

| Method | Endpoint | Auth | Role | Description |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/bookings` | Required | `STUDENT` | Create an instant booking (`status: "CONFIRMED"`). Validates availability & prevents double-booking. |
| `GET` | `/api/bookings` | Required | `STUDENT`, `TUTOR` | Get bookings for the logged-in student or tutor. Supports `?status=` and `?timeframe=upcoming\|past`. |
| `GET` | `/api/bookings/:id` | Required | `STUDENT`, `TUTOR`, `ADMIN` | Get full details of a single booking (restricted to participants or admin). |
| `PATCH` | `/api/bookings/:id/status` | Required | `STUDENT`, `TUTOR` | Update status (`TUTOR` -> `COMPLETED`; `STUDENT` -> `CANCELLED`). |

---

### 5.5 Reviews

| Method | Endpoint | Auth | Role | Description |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/reviews` | Required | `STUDENT` | Submit a rating (1–5) & comment for a `COMPLETED` booking; atomically updates tutor rating. |
| `GET` | `/api/tutors/:id/reviews` | Public | Public | Get paginated reviews for a specific tutor. |

---

### 5.6 Admin Management

| Method | Endpoint | Auth | Role | Description |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/stats` | Required | `ADMIN` | Platform-wide statistics (users count by role, bookings by status, total revenue). |
| `GET` | `/api/admin/users` | Required | `ADMIN` | List all users with pagination and filters (`?role=`, `?status=`, `?search=`). |
| `PATCH` | `/api/admin/users/:id` | Required | `ADMIN` | Update user account status (`"ACTIVE"` or `"BANNED"`). |
| `GET` | `/api/admin/bookings` | Required | `ADMIN` | View all platform bookings with filters (`?status=`, `?page=`, `?limit=`). |
| `POST` | `/api/admin/categories` | Required | `ADMIN` | Create a new subject category. |
| `PUT` | `/api/admin/categories/:id` | Required | `ADMIN` | Update an existing category. |
| `DELETE` | `/api/admin/categories/:id` | Required | `ADMIN` | Delete a category (blocked if tutors are still assigned to it). |

---

## 6. Minimum API Coverage Summary

| Module | Endpoint Count | Core Endpoints Covered |
| :--- | :---: | :--- |
| **Auth & User Profile** | 7 | Better Auth (`/sign-up/email`, `/sign-in/email`, `/verify-email`, `/get-session`, `/sign-out`), `GET /users/me`, `PATCH /users/profile` |
| **Public Discovery** | 3 | `GET /tutors`, `GET /tutors/:id`, `GET /categories` |
| **Tutor Management** | 3 | `PUT /tutor/profile`, `PUT /tutor/availability`, `GET /tutor/dashboard` |
| **Bookings** | 4 | `POST /bookings`, `GET /bookings`, `GET /bookings/:id`, `PATCH /bookings/:id/status` |
| **Reviews** | 2 | `POST /reviews`, `GET /tutors/:id/reviews` |
| **Admin Operations** | 7 | `GET /stats`, `GET /users`, `PATCH /users/:id`, `GET /bookings`, `POST/PUT/DELETE /categories` |
| **Total** | **26** | **Full end-to-end coverage of Student, Tutor, Admin, Better Auth & Public flows** |

---

## 7. Additional Technical Requirements

### 7.1 Standardized API Response Format
All custom REST endpoints (`/api/tutors`, `/api/bookings`, `/api/reviews`, `/api/tutor/*`, `/api/admin/*`, `/api/users/*`) must return a consistent JSON envelope:

* **Success Envelope:**
  ```json
  {
    "success": true,
    "message": "Operation successful",
    "data": {},
    "meta": {
      "page": 1,
      "limit": 10,
      "total": 42,
      "totalPages": 5
    }
  }
  ```

* **Error Envelope:**
  ```json
  {
    "success": false,
    "message": "Clear error description",
    "errorDetails": []
  }
  ```

### 7.2 Auth & RBAC Middleware Contract (`middleware/auth.ts`)
Your `auth(...roles: UserRole[])` middleware must perform these four steps in order:
1. Extract session via `authFromLib.api.getSession({ headers: fromNodeHeaders(req.headers) })`.
2. If `!session`, return `401 Unauthorized`.
3. If `session.user.status === "BANNED"`, return `403 Forbidden` (`"Your account has been banned"`).
4. If `roles.length && !roles.includes(session.user.role as UserRole)`, return `403 Forbidden`.
5. Attach `req.user = session.user` and `req.session = session.session` so controllers can read `req.user.id` and `req.user.role` directly.

### 7.3 Important Fixes in `lib/auth.ts`
* **Role Selection on Registration:** Allow users to choose `"STUDENT"` or `"TUTOR"` during sign-up while blocking `"ADMIN"` (e.g., via a Better Auth `databaseHooks.user.create.before` hook that enforces `role = requestedRole === "TUTOR" ? "TUTOR" : "STUDENT"`).
* **Email Branding:** Update the HTML template in `sendVerificationEmail` from `"Prisma Blog"` to `"SkillBridge"`.

### 7.4 Database Seeding (`prisma/seed.ts`)
Running `bunx prisma db seed` must idempotently create:
* **1 Admin User:** `admin@skillbridge.com` with `role: "ADMIN"`, `status: "ACTIVE"`, `emailVerified: true` (using Better Auth's password hashing or `auth.api.signUpEmail` + role update).
* **Initial Categories:** *Web Development*, *Mathematics*, *Data Science*, *UI/UX Design*, *Languages*.
* **Sample Tutors (Optional for dev):** Pre-populated tutor profiles with availability slots for immediate testing.

### 7.5 Environment Variables (`.env`)
```env
PORT=5000
NODE_ENV=development
DATABASE_URL="postgresql://user:password@localhost:5432/skillbridge?schema=public"
BETTER_AUTH_SECRET="your-super-secret-better-auth-key"
BETTER_AUTH_URL="http://localhost:5000"
APP_URL="http://localhost:3000"
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-gmail-app-password"
ADMIN_EMAIL="admin@skillbridge.com"
ADMIN_PASSWORD="AdminPassword123!"
```

---

## 8. Example API Request/Response

### 8.1 Update Tutor Profile (`PUT /api/tutor/profile`)
**Headers:** `Cookie: better-auth.session_token=...`  
**Request:**
```json
{
  "categoryId": "d4e5f6a7-8901-2345-6789-abcdef012345",
  "headline": "Senior Full-Stack TypeScript & Prisma Mentor",
  "bio": "6+ years building scalable Node/Bun APIs and teaching modern web development.",
  "hourlyRate": 30,
  "experienceYears": 6,
  "subjects": ["TypeScript", "Node.js", "Prisma", "PostgreSQL"]
}
```
**Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Tutor profile saved successfully",
  "data": {
    "id": "f1e2d3c4-5678-4a9b-8c7d-9876543210fe",
    "userId": "c7a8b9d0-1234-4e5f-8a9b-0123456789ab",
    "headline": "Senior Full-Stack TypeScript & Prisma Mentor",
    "hourlyRate": 30,
    "experienceYears": 6,
    "subjects": ["TypeScript", "Node.js", "Prisma", "PostgreSQL"],
    "averageRating": 0,
    "totalReviews": 0
  }
}
```

### 8.2 Update Tutor Availability (`PUT /api/tutor/availability`)
**Headers:** `Cookie: better-auth.session_token=...`  
**Request:**
```json
{
  "availability": [
    { "day": "Monday", "startTime": "10:00", "endTime": "14:00" },
    { "day": "Thursday", "startTime": "16:00", "endTime": "20:00" }
  ]
}
```
**Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Availability updated successfully",
  "data": {
    "tutorId": "f1e2d3c4-5678-4a9b-8c7d-9876543210fe",
    "availability": [
      { "day": "Monday", "startTime": "10:00", "endTime": "14:00" },
      { "day": "Thursday", "startTime": "16:00", "endTime": "20:00" }
    ]
  }
}
```

### 8.3 Create Booking (`POST /api/bookings`)
**Headers:** `Cookie: better-auth.session_token=...`  
**Request:**
```json
{
  "tutorId": "f1e2d3c4-5678-4a9b-8c7d-9876543210fe",
  "subject": "Prisma",
  "sessionDate": "2026-11-23",
  "startTime": "10:00",
  "endTime": "11:30",
  "notes": "Need help debugging Prisma 7 migrations and relations."
}
```
**Response (`201 Created`):**
```json
{
  "success": true,
  "message": "Session booked and confirmed",
  "data": {
    "id": "99887766-5544-3322-1100-aabbccddeeff",
    "studentId": "11223344-5566-7788-9900-ffeeddccbbaa",
    "tutorId": "f1e2d3c4-5678-4a9b-8c7d-9876543210fe",
    "subject": "Prisma",
    "sessionDate": "2026-11-23T00:00:00.000Z",
    "startTime": "10:00",
    "endTime": "11:30",
    "totalPrice": 45,
    "status": "CONFIRMED",
    "notes": "Need help debugging Prisma 7 migrations and relations."
  }
}
```

### 8.4 Submit Review (`POST /api/reviews`)
**Headers:** `Cookie: better-auth.session_token=...`  
**Request:**
```json
{
  "bookingId": "99887766-5544-3322-1100-aabbccddeeff",
  "rating": 5,
  "comment": "Super helpful session! Solved my schema issue right away."
}
```
**Response (`201 Created`):**
```json
{
  "success": true,
  "message": "Review submitted successfully",
  "data": {
    "id": "aa11bb22-cc33-dd44-ee55-ff6677889900",
    "bookingId": "99887766-5544-3322-1100-aabbccddeeff",
    "rating": 5,
    "comment": "Super helpful session! Solved my schema issue right away.",
    "createdAt": "2026-11-23T12:00:00.000Z"
  }
}
```

### 8.5 Error Response Example (`409 Conflict` — Double Booking)
```json
{
  "success": false,
  "message": "The selected time slot is already booked for this tutor.",
  "errorDetails": [
    {
      "field": "startTime",
      "issue": "Overlaps with existing CONFIRMED booking from 10:00 to 11:30"
    }
  ]
}
```

---

## 9. Final Notes

* **Express Route Mounting Order:** Mount Better Auth (`app.all("/api/auth/*splat", toNodeHandler(auth))`) **before** `app.use(express.json())`, because Better Auth parses its own raw request bodies; mount `express.json()` after it for your custom REST routes (`/api/tutors`, `/api/bookings`, etc.).
* **Prisma 7 Workflow:** Remember to always pass a single quoted migration name (`bunx prisma migrate dev --name "your_migration_name"`) and preserve `@@map("user")` on `model User` so existing Better Auth user records are never dropped.
* **Modular Architecture:** Organize domain logic cleanly under `src/modules/<feature>/` (`user`, `tutor`, `category`, `booking`, `review`, `admin`), each with `*.route.ts`, `*.controller.ts`, `*.service.ts`, and `*.validation.ts`.