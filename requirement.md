# SkillBridge — Backend Requirements Specification (`requirements.md`)

---

## 1. Overview

**SkillBridge** ("Connect with Expert Tutors, Learn Anything") is a full-stack tutoring marketplace backend API. It connects learners (**Students**) with verified subject-matter experts (**Tutors**), while allowing platform administrators (**Admins**) to oversee users, bookings, and subject categories.

The backend serves as a RESTful API responsible for:
* User registration, authentication, and JWT-based session management.
* Role-Based Access Control (RBAC) across `STUDENT`, `TUTOR`, and `ADMIN` roles.
* Public tutor discovery with multi-criteria search, filtering, and sorting.
* Tutor profile management and weekly/dated availability slot configuration.
* Instant session booking with double-booking and slot validation.
* Booking lifecycle transitions (`CONFIRMED` -> `COMPLETED` or `CANCELLED`).
* Verified post-session reviews and automatic tutor rating recalculation.
* Administrative moderation (ban/unban users, manage categories, view platform analytics).

---

## 2. Tech Stack

Since `README.md` was not included in the prompt, below is the standard production stack aligned with Prisma ORM and TypeScript REST APIs (adjust specific package versions to match your `package.json`):

* **Runtime & Language:** Node.js (v20+) with TypeScript
* **Web Framework:** Express.js (or Fastify / NestJS)
* **Database:** PostgreSQL (v15+)
* **ORM:** Prisma ORM (`@prisma/client`, `prisma`)
* **Authentication & Security:** JSON Web Tokens (`jsonwebtoken` / `jose`), `bcrypt` (password hashing), `cors`, `helmet`
* **Validation:** Zod (request body, query params, and route parameter validation)
* **API Documentation (Optional/Recommended):** Swagger / OpenAPI (`swagger-ui-express`)

---

## 3. Core Project Rules

### 3.1 Role & Account Rules
1. **Self-Registration Roles:** Public registration (`POST /api/auth/register`) accepts only `"STUDENT"` or `"TUTOR"`. Any attempt to pass `"ADMIN"` must be rejected with `403 Forbidden` or `400 Bad Request`.
2. **Admin Seeding:** Admin accounts cannot be created via public APIs. They must be initialized via a Prisma database seed script (`prisma/seed.ts`).
3. **Banned User Enforcement:** If an `ADMIN` updates a user's status to `"BANNED"`:
   * The user cannot log in (`403 Forbidden`).
   * Authentication middleware must check the user's current database status (or token blacklist) on protected routes and reject requests from banned accounts with `403 Forbidden`.
4. **Self-Ban Prevention:** An `ADMIN` cannot change their own status to `"BANNED"`.

### 3.2 Tutor Profile & Availability Rules
5. **Tutor Profile Initialization:** When a user registers as a `TUTOR`, either create a default `TutorProfile` automatically or require them to create one via `PUT /api/tutor/profile` before appearing in public tutor listings.
6. **Public Visibility:** `GET /api/tutors` should only return tutors whose linked `User.status === "ACTIVE"` and who have completed their `TutorProfile`.
7. **Availability Format:** Availability slots define when a tutor can be booked (e.g., day of week + start/end time in `HH:mm` 24-hour format). Start time must strictly precede end time.

### 3.3 Booking & Scheduling Rules
8. **Instant Confirmation:** All valid new bookings are created directly in `CONFIRMED` status (no manual tutor approval step).
9. **Self-Booking Prevention:** A user with both a student token or matching ID cannot book their own tutor profile (`studentId !== tutorProfile.userId`).
10. **Availability & Double-Booking Validation:**
    * The requested `sessionDate`, `startTime`, and `endTime` must fall within the tutor's configured availability.
    * The system must reject (`409 Conflict`) any booking that overlaps with an existing `CONFIRMED` booking for the same tutor on the same `sessionDate`.
11. **Price Calculation:** `totalPrice` is calculated on the backend using `tutorProfile.hourlyRate * durationInHours`—never trust client-submitted prices.
12. **State Machine Transitions:**
    * `CONFIRMED` -> `COMPLETED`: Permitted **only** by the assigned `TUTOR` (or `ADMIN`).
    * `CONFIRMED` -> `CANCELLED`: Permitted **only** by the `STUDENT` who created the booking (or `ADMIN`).
    * Terminal States: Once a booking is `COMPLETED` or `CANCELLED`, its status cannot be modified again (`400 Bad Request`).

### 3.4 Review & Rating Rules
13. **Review Eligibility:** A `STUDENT` can submit a review (`POST /api/reviews`) **only if**:
    * They are the owner (`studentId`) of the referenced `bookingId`.
    * The booking's status is `COMPLETED`.
    * No review already exists for that `bookingId` (1 review per booking).
14. **Atomic Rating Aggregation:** Whenever a review is created, execute a database transaction that saves the `Review` and recalculates the tutor's `averageRating` and `totalReviews` on `TutorProfile`.

---

## 4. Database Schema (Prisma Models)

Save this schema in `prisma/schema.prisma`:

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
  id        String     @id @default(uuid())
  name      String
  email     String     @unique
  password  String
  role      Role       @default(STUDENT)
  status    UserStatus @default(ACTIVE)
  avatar    String?
  phone     String?
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt

  // Relations
  tutorProfile    TutorProfile?
  studentBookings Booking[]     @relation("StudentBookings")
  reviews         Review[]

  @@index([role])
  @@index([status])
  @@map("users")
}

model Category {
  id          String   @id @default(uuid())
  name        String   @unique
  slug        String   @unique
  description String?
  icon        String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // Relations
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
  // Stores array of slot objects: [{ "day": "Monday", "startTime": "09:00", "endTime": "17:00" }]
  availability    Json     @default("[]")
  averageRating   Float    @default(0.0)
  totalReviews    Int      @default(0)
  isFeatured      Boolean  @default(false)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  // Relations
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
  startTime   String        // Format: "HH:mm" (e.g., "14:00")
  endTime     String        // Format: "HH:mm" (e.g., "15:00")
  totalPrice  Float
  status      BookingStatus @default(CONFIRMED)
  notes       String?       @db.Text
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  // Relations
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
  rating    Int      // Validated 1 to 5
  comment   String   @db.Text
  createdAt DateTime @default(now())

  // Relations
  booking Booking      @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  student User         @relation(fields: [studentId], references: [id], onDelete: Cascade)
  tutor   TutorProfile @relation(fields: [tutorId], references: [id], onDelete: Cascade)

  @@index([tutorId])
  @@map("reviews")
}


## 5. API Endpoints

### 5.1 Authentication & User Profile
| Method | Endpoint | Auth | Role | Description |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Public | Any (`STUDENT`/`TUTOR`) | Register a new student or tutor account. |
| `POST` | `/api/auth/login` | Public | Any | Authenticate credentials and return JWT + user details. |
| `GET` | `/api/auth/me` | Required | `STUDENT`, `TUTOR`, `ADMIN` | Get current authenticated user profile (includes `tutorProfile` if `TUTOR`). |
| `PATCH` | `/api/users/profile` | Required | `STUDENT`, `TUTOR`, `ADMIN` | Update basic profile fields (`name`, `phone`, `avatar`). |

---

### 5.2 Tutors & Categories (Public Discovery)
| Method | Endpoint | Auth | Role | Description |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/tutors` | Public | Public | List active tutors with search, filters, sorting, and pagination. |
| `GET` | `/api/tutors/:id` | Public | Public | Get single tutor profile by `TutorProfile.id`, including `user`, `category`, `availability`, and `reviews`. |
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
| `PUT` | `/api/tutor/availability` | Required | `TUTOR` | Set or replace weekly availability slots. |
| `GET` | `/api/tutor/dashboard` | Required | `TUTOR` | Retrieve tutor metrics (total sessions, completed sessions, upcoming sessions, total earnings, average rating). |

---

### 5.4 Bookings
| Method | Endpoint | Auth | Role | Description |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/bookings` | Required | `STUDENT` | Create an instant booking (`status: "CONFIRMED"`). |
| `GET` | `/api/bookings` | Required | `STUDENT`, `TUTOR` | Get bookings belonging to the logged-in student or tutor. Supports `?status=` and `?timeframe=upcoming|past`. |
| `GET` | `/api/bookings/:id` | Required | `STUDENT`, `TUTOR`, `ADMIN` | Get full details of a booking (restricted to participants or admin). |
| `PATCH` | `/api/bookings/:id/status` | Required | `STUDENT`, `TUTOR` | Update status (`TUTOR` -> `COMPLETED`; `STUDENT` -> `CANCELLED`). |

---

### 5.5 Reviews
| Method | Endpoint | Auth | Role | Description |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/reviews` | Required | `STUDENT` | Create a review for a `COMPLETED` booking and update tutor rating. |
| `GET` | `/api/tutors/:id/reviews` | Public | Public | Get paginated reviews for a specific tutor. |

---

### 5.6 Admin Management
| Method | Endpoint | Auth | Role | Description |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/stats` | Required | `ADMIN` | Get platform-wide statistics (users count by role, bookings by status, revenue). |
| `GET` | `/api/admin/users` | Required | `ADMIN` | List all users with pagination and filters (`?role=`, `?status=`, `?search=`). |
| `PATCH` | `/api/admin/users/:id` | Required | `ADMIN` | Update user account status (`"ACTIVE"` or `"BANNED"`). |
| `GET` | `/api/admin/bookings` | Required | `ADMIN` | View all bookings across the platform with filters (`?status=`, `?page=`, `?limit=`). |
| `POST` | `/api/admin/categories` | Required | `ADMIN` | Create a new subject category. |
| `PUT` | `/api/admin/categories/:id` | Required | `ADMIN` | Update an existing category. |
| `DELETE` | `/api/admin/categories/:id` | Required | `ADMIN` | Delete a category (blocked if tutors are still linked to it). |

---

## 6. Minimum API Coverage Summary

| Module | Endpoint Count | Core Endpoints Covered |
| :--- | :---: | :--- |
| **Authentication & User** | 4 | `POST /register`, `POST /login`, `GET /me`, `PATCH /users/profile` |
| **Public Discovery** | 3 | `GET /tutors`, `GET /tutors/:id`, `GET /categories` |
| **Tutor Management** | 3 | `PUT /tutor/profile`, `PUT /tutor/availability`, `GET /tutor/dashboard` |
| **Bookings** | 4 | `POST /bookings`, `GET /bookings`, `GET /bookings/:id`, `PATCH /bookings/:id/status` |
| **Reviews** | 2 | `POST /reviews`, `GET /tutors/:id/reviews` |
| **Admin Operations** | 7 | `GET /stats`, `GET /users`, `PATCH /users/:id`, `GET /bookings`, `POST/PUT/DELETE /categories` |
| **Total** | **23** | **Full end-to-end coverage of Student, Tutor, Admin, and Public flows** |

---

## 7. Additional Technical Requirements

### 7.1 Standardized API Response Format
Every endpoint must return a consistent JSON envelope:

* **Success Envelope:**
```json
{
  "success": true,
  "message": "Human-readable status message",
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

### 7.2 Middleware Pipeline
1. **`authMiddleware`**: Extracts `Authorization: Bearer <token>`, verifies JWT signature, fetches user record to confirm existence and `status !== "BANNED"`, and attaches `req.user = { id, email, role }`.
2. **`authorizeRoles(...allowedRoles)`**: Checks if `req.user.role` is included in `allowedRoles`; otherwise throws `403 Forbidden`.
3. **`validateRequest(schema)`**: Validates `req.body`, `req.query`, and `req.params` via Zod before hitting controllers.
4. **`globalErrorHandler`**: Catches Prisma errors (e.g., `P2002` unique constraint -> `409 Conflict`, `P2025` record not found -> `404 Not Found`), JWT errors (`401 Unauthorized`), and unexpected server errors (`500 Internal Server Error`).

### 7.3 Database Seeding (`prisma/seed.ts`)
Running `npx prisma db seed` must idempotently create:
* **1 Admin User:** e.g., `admin@skillbridge.com` (hashed password from `.env`).
* **Initial Categories:** e.g., *Web Development*, *Mathematics*, *Data Science*, *UI/UX Design*, *Languages*.
* **Sample Tutors & Students (Optional for dev):** Pre-populated tutor profiles with availability slots so the landing page and browse page work immediately upon setup.

### 7.4 Environment Variables (`.env.example`)
```env
PORT=5000
NODE_ENV=development
DATABASE_URL="postgresql://user:password@localhost:5432/skillbridge?schema=public"
JWT_SECRET="your-super-secret-jwt-key"
JWT_EXPIRES_IN="7d"
CLIENT_URL="http://localhost:3000"
ADMIN_EMAIL="admin@skillbridge.com"
ADMIN_PASSWORD="AdminPassword123!"
```

---

## 8. Example API Request/Response

### 8.1 Register User (`POST /api/auth/register`)
**Request:**
```json
{
  "name": "Rahim Ahmed",
  "email": "rahim.tutor@example.com",
  "password": "Password123!",
  "role": "TUTOR"
}
```
**Response (`201 Created`):**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "c7a8b9d0-1234-4e5f-8a9b-0123456789ab",
      "name": "Rahim Ahmed",
      "email": "rahim.tutor@example.com",
      "role": "TUTOR",
      "status": "ACTIVE",
      "createdAt": "2026-11-20T03:00:00.000Z"
    }
  }
}
```

### 8.2 Update Tutor Availability (`PUT /api/tutor/availability`)
**Headers:** `Authorization: Bearer <tutor_token>`  
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
**Headers:** `Authorization: Bearer <student_token>`  
**Request:**
```json
{
  "tutorId": "f1e2d3c4-5678-4a9b-8c7d-9876543210fe",
  "subject": "Node.js & Prisma",
  "sessionDate": "2026-11-23",
  "startTime": "10:00",
  "endTime": "11:30",
  "notes": "Would like to review Prisma relational queries."
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
    "subject": "Node.js & Prisma",
    "sessionDate": "2026-11-23T00:00:00.000Z",
    "startTime": "10:00",
    "endTime": "11:30",
    "totalPrice": 45.0,
    "status": "CONFIRMED",
    "notes": "Would like to review Prisma relational queries.",
    "createdAt": "2026-11-20T03:15:00.000Z"
  }
}
```

### 8.4 Submit Review (`POST /api/reviews`)
**Headers:** `Authorization: Bearer <student_token>`  
**Request:**
```json
{
  "bookingId": "99887766-5544-3322-1100-aabbccddeeff",
  "rating": 5,
  "comment": "Fantastic session! Explained complex queries clearly."
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
    "comment": "Fantastic session! Explained complex queries clearly.",
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

* **Folder Structure Recommendation:** Organize the backend cleanly into `src/modules/<feature>/` (`auth`, `user`, `tutor`, `category`, `booking`, `review`, `admin`), each containing its own `*.route.ts`, `*.controller.ts`, `*.service.ts`, and `*.validation.ts`.
* **Time Zone Consistency:** Store `sessionDate` in UTC (`YYYY-MM-DD`) and compare `startTime` / `endTime` strings consistently (converting `HH:mm` to minutes since midnight when checking overlaps or slot boundaries).
* **Frontend Alignment:** Ensure all route paths and response fields match the frontend pages (`/tutors`, `/tutors/:id`, `/dashboard/bookings`, `/tutor/availability`, `/admin/users`, `/admin/categories`) so frontend integration requires zero adapter glue.