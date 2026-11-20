# SkillBridge — Online Tutor Booking

# Project Requirements Specification

---

## 1. Overview
**SkillBridge** is a full-stack RESTful backend API powering an interactive online tutoring marketplace. The platform connects learners (students) with verified subject-matter experts (tutors) for scheduled one-on-one learning sessions. It removes the friction of manual scheduling through instant booking, real-time availability calendar management, anti-double-booking conflict prevention, post-session verified student reviews, and administrative platform governance.

### Key Features
- **Tutor Discovery & Faceted Search**: Multi-criteria search and filtering by category, subject keywords, hourly rate range, minimum rating, and featured status.
- **Tutor Profiles & Specializations**: Comprehensive mentor profiles showcasing bios, headlines, hourly pricing, years of experience, and categorized subjects.
- **Weekly Availability Management**: Flexible scheduling engine allowing tutors to configure active time windows across days of the week.
- **Instant Booking Engine**: Frictionless booking system where students book sessions that are instantly confirmed without pending wait times.
- **Double-Booking & Conflict Prevention**: Concurrency-safe validation preventing tutors from receiving overlapping session bookings on the same date and time.
- **Session Lifecycle Management**: Robust state machine supporting `CONFIRMED`, `COMPLETED`, and `CANCELLED` statuses with strict role-based access.
- **Verified Review & Rating Engine**: Post-session reviews restricted strictly to completed sessions, with real-time atomic tutor rating recalculation.
- **User Account Moderation**: Administrative tools to oversee user accounts, ban/unban abusive actors, and enforce instant token invalidation.
- **Category Taxonomies**: Dynamic subject category management (CRUD) allowing admins to curate educational domains.
- **Platform Analytics**: High-level platform statistics tracking revenue volume, user growth, booking fulfillment rates, and review statistics.

---

## 2. Tech Stack

| Category | Technology | Purpose |
| :--- | :--- | :--- |
| **Runtime & Framework** | Node.js / Bun, TypeScript, Express.js (v5) | High-performance REST API development with strict end-to-end type safety |
| **Database & ORM** | PostgreSQL + Prisma ORM (v7) | Relational database schema, indexed relations, foreign key cascades, and atomic transactions |
| **Database Adapter** | `@prisma/adapter-pg` | Native PostgreSQL connection pooling adapter for Prisma Client |
| **Authentication** | Better-Auth (`better-auth`) / JWT Session Management | Cookie/token session management, password hashing, email verification, and role-based access control (RBAC) |
| **Validation** | Zod | Runtime request body, query parameter, and route parameter schema validation |
| **Email Service** | Nodemailer (SMTP / Gmail) | Transactional email delivery for account email verification and booking alerts |
| **Security & Middleware** | Helmet, CORS, `express-rate-limit` | HTTP security headers, cross-origin resource sharing, and rate limiting to prevent brute-force attacks |
| **Database Seeding** | TypeScript Seed Script (`bun run seed:admin`) | Automated database seeding for default admin account and initial subject categories |
| **Documentation** | Postman Collection / Thunder Client | Comprehensive interactive API testing collection with sample requests and responses |
| **Deployment** | Render / Vercel / Railway / VPS | Cloud server hosting with PostgreSQL managed database |

---

## 3. Core Project Rules

### 3.1 Roles & Permissions
The system enforces three distinct user roles:
- **Student**: Can browse tutors, book instant sessions, cancel own bookings, submit reviews on completed sessions, and manage their student profile.
- **Tutor**: Can create and update their public tutor profile, define weekly availability slots, view assigned teaching sessions, mark sessions as `COMPLETED`, and track earnings and reviews.
- **Admin**: Has overarching platform authority: can view all users, toggle account status (`ACTIVE` vs `BANNED`), view all platform bookings, manage categories (CRUD), and inspect platform analytics.

Role permissions must be strictly verified using authentication and authorization middleware.

### 3.2 Registration & Admin Seeding Policy
- During self-registration (`/api/auth/register` or `/api/auth/sign-up/email`), users can **only** select either `STUDENT` or `TUTOR`.
- Attempting to pass `role: "ADMIN"` in any public registration request must be **strictly rejected** with `403 Forbidden` or `400 Bad Request`.
- Administrator accounts must **only** be created through the database seed script (`src/script/seedAdmin.ts` via `bun run seed:admin`).

### 3.3 Account Status & Ban Enforcement
- User accounts have an operational status of either `ACTIVE` or `BANNED` (default: `ACTIVE`).
- When an administrator bans a user (`status: "BANNED"`):
  - The user is immediately blocked from logging in (`403 Forbidden`).
  - Auth middleware must reject any subsequent requests bearing an active session or token belonging to a banned user with `403 Forbidden` (`"Your account has been suspended. Please contact support."`).
  - If the banned user is a tutor, their profile is automatically excluded from public tutor listings (`/api/tutors`).

### 3.4 Instant Booking & Conflict Prevention Rules
- **Instant Confirmation**: New session bookings start immediately in `CONFIRMED` status (no manual approval required).
- **Self-Booking Restriction**: A user cannot book a tutoring session with their own tutor profile (`studentId !== tutorProfile.userId`). Violations return `400 Bad Request`.
- **Availability Schedule Match**: The requested `sessionDate` maps to a weekday (`0` = Sunday to `6` = Saturday). The tutor must have an active `Availability` slot encompassing the requested `startTime` and `endTime`. Otherwise, reject with `400 Bad Request`.
- **Anti-Double-Booking Check**: A tutor cannot have overlapping bookings on the same date where status is `CONFIRMED`.
  - Overlap condition: `(requestedStartTime < existingEndTime) && (requestedEndTime > existingStartTime)`.
  - Conflicting booking attempts must be rejected with `409 Conflict` (`"The selected tutor already has a confirmed session in this time slot."`).

### 3.5 Session Lifecycle & State Transitions
- **`CONFIRMED` $\to$ `COMPLETED`**: Can **only** be executed by the assigned tutor or platform admin after the session concludes.
- **`CONFIRMED` $\to$ `CANCELLED`**: Can be executed by the student who booked the session, the assigned tutor, or platform admin.
- **Terminal States**: Once a session reaches `COMPLETED` or `CANCELLED`, its status is immutable and cannot be reverted or altered (`400 Bad Request`).

### 3.6 Review Integrity & Rating Aggregation
- Reviews can **only** be submitted by the student who booked the session.
- A review can **only** be created if the booking status is `COMPLETED`. Attempting to review a `CONFIRMED` or `CANCELLED` session returns `400 Bad Request`.
- **Strict 1:1 Relationship**: Each booking can receive at most one review (`bookingId` is unique). Duplicate submissions return `409 Conflict`.
- **Atomic Calculation**: Submitting a review must run in a database transaction (`prisma.$transaction`) that recalculates the tutor's `avgRating` (rounded to 1 decimal place) and increments `reviewCount`.

### 3.7 No Frontend Required
- This is a backend-only assignment.
- All functional capabilities must be demonstrated and verified using Postman, Thunder Client, or cURL.

### 3.8 Security & Concurrency
- Passwords securely hashed (handled via Better-Auth / bcrypt).
- All sensitive credentials stored in environment variables (`.env`).
- All protected routes guarded by session authentication middleware.
- Security headers enabled via `helmet`.
- Rate limiting applied globally and strictly on authentication endpoints via `express-rate-limit`.
- Cross-Origin Resource Sharing (`cors`) configured to trusted client origins with credentials support.
- Database transactions utilized for critical multi-step operations (booking conflict verification, review rating aggregation).

---

## 4. Database Schema (Prisma Models)

The following complete Prisma schema defines all required entities, relations, indexes, and constraints.

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client"
  output   = "../../generated/prisma"
}

// ==========================================
// 1. User & Authentication Models
// ==========================================

model User {
  id            String    @id @default(uuid())
  name          String
  email         String    @unique
  emailVerified Boolean   @default(false)
  image         String?
  role          Role      @default(STUDENT)
  status        UserStatus @default(ACTIVE)
  phone         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // Better-Auth Relations
  sessions      Session[]
  accounts      Account[]

  // Domain Relations
  tutorProfile  TutorProfile?
  bookings      Booking[]     @relation("StudentBookings")
  reviews       Review[]      @relation("StudentReviews")

  @@index([email])
  @@index([role])
  @@index([status])
  @@map("user")
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

  @@index([userId])
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

  @@index([userId])
  @@map("account")
}

model Verification {
  id         String   @id
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([identifier])
  @@map("verification")
}

// ==========================================
// 2. Tutor & Specialization Models
// ==========================================

model TutorProfile {
  id              String          @id @default(uuid())
  userId          String          @unique
  user            User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  headline        String
  bio             String          @db.Text
  hourlyRate      Decimal         @db.Decimal(10, 2)
  experienceYears Int             @default(0)
  isFeatured      Boolean         @default(false)
  avgRating       Float           @default(0.0)
  reviewCount     Int             @default(0)
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  // Relations
  categories      TutorCategory[]
  availabilities  Availability[]
  bookings        Booking[]       @relation("TutorBookings")
  reviews         Review[]        @relation("TutorReviews")

  @@index([hourlyRate])
  @@index([avgRating])
  @@index([isFeatured])
  @@map("tutor_profile")
}

model Category {
  id          String          @id @default(uuid())
  name        String          @unique
  slug        String          @unique
  description String?         @db.Text
  icon        String?
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  // Relations
  tutors      TutorCategory[]
  bookings    Booking[]

  @@index([slug])
  @@map("category")
}

model TutorCategory {
  tutorProfileId String
  categoryId     String
  tutorProfile   TutorProfile @relation(fields: [tutorProfileId], references: [id], onDelete: Cascade)
  category       Category     @relation(fields: [categoryId], references: [id], onDelete: Cascade)

  @@id([tutorProfileId, categoryId])
  @@map("tutor_category")
}

model Availability {
  id             String       @id @default(uuid())
  tutorProfileId String
  tutorProfile   TutorProfile @relation(fields: [tutorProfileId], references: [id], onDelete: Cascade)
  dayOfWeek      Int          // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  startTime      String       // 24-hr format "HH:mm" (e.g., "09:00")
  endTime        String       // 24-hr format "HH:mm" (e.g., "17:00")
  isActive       Boolean      @default(true)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  @@index([tutorProfileId, dayOfWeek])
  @@map("availability")
}

// ==========================================
// 3. Booking & Review Models
// ==========================================

model Booking {
  id             String        @id @default(uuid())
  studentId      String
  student        User          @relation("StudentBookings", fields: [studentId], references: [id], onDelete: Cascade)
  tutorProfileId String
  tutorProfile   TutorProfile  @relation("TutorBookings", fields: [tutorProfileId], references: [id], onDelete: Cascade)
  categoryId     String?
  category       Category?     @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  sessionDate    DateTime      @db.Date
  startTime      String        // "10:00"
  endTime        String        // "11:00"
  price          Decimal       @db.Decimal(10, 2)
  status         BookingStatus @default(CONFIRMED)
  notes          String?       @db.Text
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  // Relations
  review         Review?

  @@index([tutorProfileId, sessionDate, status])
  @@index([studentId])
  @@index([status])
  @@map("booking")
}

enum BookingStatus {
  CONFIRMED
  COMPLETED
  CANCELLED
}

model Review {
  id             String       @id @default(uuid())
  bookingId      String       @unique
  booking        Booking      @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  studentId      String
  student        User         @relation("StudentReviews", fields: [studentId], references: [id], onDelete: Cascade)
  tutorProfileId String
  tutorProfile   TutorProfile @relation("TutorReviews", fields: [tutorProfileId], references: [id], onDelete: Cascade)
  rating         Int          // Integer: 1, 2, 3, 4, 5
  comment        String       @db.Text
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  @@index([tutorProfileId])
  @@index([studentId])
  @@map("review")
}
```

---

## 5. API Endpoints (25+)

All endpoints are prefixed with `/api` and adhere to a standard JSON envelope:

**Success Response Envelope:**
```json
{
  "success": true,
  "message": "Operation successful",
  "data": {}
}
```

**Error Response Envelope:**
```json
{
  "success": false,
  "message": "Descriptive error message",
  "errors": []
}
```

---

### 5.1 Authentication Module
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/sign-up/email` | Register new user (Student or Tutor) | Public |
| `POST` | `/api/auth/sign-in/email` | Authenticate user & obtain session token | Public |
| `POST` | `/api/auth/sign-out` | Logout and invalidate active session | Authenticated |
| `GET` | `/api/auth/get-session` | Get active session & authenticated user info | Authenticated |
| `POST` | `/api/auth/verify-email` | Verify email address using token | Public |

*Permissions: Public registration strictly permits `role: "STUDENT"` or `role: "TUTOR"`. Supplying `role: "ADMIN"` is blocked (`403`). Banned users are denied login (`403`).*

---

### 5.2 User & Profile Module
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/users/profile` | Get current authenticated user profile | Authenticated |
| `PATCH` | `/api/users/profile` | Update profile details (name, phone, image) | Authenticated |
| `GET` | `/api/users/:id` | Get public user info | Authenticated |

*Permissions: Users can only update their own profile information.*

---

### 5.3 Public Tutor Discovery & Categories Module
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/tutors` | Browse tutors with multi-criteria filters & pagination | Public |
| `GET` | `/api/tutors/:id` | Get full tutor profile with availability & reviews | Public |
| `GET` | `/api/tutors/featured` | Get featured tutors for landing page showcase | Public |
| `GET` | `/api/categories` | List all categories with associated tutor counts | Public |
| `GET` | `/api/categories/:id` | Get category details by ID or slug | Public |

*Filters for `GET /api/tutors`: `?search=react&category=web-development&minPrice=20&maxPrice=80&minRating=4.0&isFeatured=true&sortBy=rating_desc&page=1&limit=10`*

*Permissions: Publicly accessible. Tutors whose user status is `BANNED` are automatically excluded from listings.*

---

### 5.4 Tutor Management Module
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/tutor/profile` | Create initial tutor profile | Tutor |
| `PUT` | `/api/tutor/profile` | Update tutor profile (headline, bio, rate, categories) | Tutor |
| `GET` | `/api/tutor/profile/me` | Get own tutor profile details | Tutor |
| `GET` | `/api/tutor/availability` | Get configured weekly availability time slots | Tutor |
| `PUT` | `/api/tutor/availability` | Set or replace weekly availability schedule | Tutor |
| `GET` | `/api/tutor/sessions` | View teaching sessions assigned to this tutor | Tutor |
| `PATCH` | `/api/tutor/sessions/:id/complete` | Mark a confirmed session as completed | Tutor (own) / Admin |
| `GET` | `/api/tutor/stats` | Get tutor dashboard KPIs (earnings, hours, ratings) | Tutor |

*Permissions: Only users with `role: "TUTOR"` can manage their tutor profile and availability. Tutors can only complete sessions assigned to them.*

---

### 5.5 Bookings Module (Session Workflow)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/bookings` | Book an instant tutoring session (`CONFIRMED`) | Student |
| `GET` | `/api/bookings` | List bookings for current user (with filters) | Authenticated |
| `GET` | `/api/bookings/:id` | Get single booking details | Student (own) / Tutor (own) / Admin |
| `PATCH` | `/api/bookings/:id/cancel` | Cancel a confirmed booking | Student (own) / Tutor (own) / Admin |

*Filters for `GET /api/bookings`: `?status=CONFIRMED&type=upcoming&page=1&limit=10`*

*Permissions: Students create bookings; anti-double-booking algorithm prevents overlapping slots; students can cancel own bookings; tutors can cancel assigned sessions.*

---

### 5.6 Reviews & Ratings Module
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/reviews` | Submit review for a completed session | Student |
| `GET` | `/api/reviews/my-reviews` | Get all reviews written by logged-in student | Student |
| `GET` | `/api/tutors/:id/reviews` | Get paginated reviews for a specific tutor | Public |

*Permissions: Only the student who booked the session can submit a review. The session must be in `COMPLETED` status. Strictly 1 review per booking.*

---

### 5.7 Admin Operations Module
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/users` | List all platform users with role/status filters | Admin |
| `PATCH` | `/api/admin/users/:id/status` | Update user status (`ACTIVE` or `BANNED`) | Admin |
| `GET` | `/api/admin/bookings` | Audit all platform bookings with date & status filters | Admin |
| `POST` | `/api/admin/categories` | Create a new subject category | Admin |
| `PUT` | `/api/admin/categories/:id` | Update category name, slug, or description | Admin |
| `DELETE` | `/api/admin/categories/:id` | Delete category (blocked if tutors assigned) | Admin |
| `GET` | `/api/admin/analytics` | Get platform-wide business analytics & metrics | Admin |

*Permissions: All routes in this section strictly require `role: "ADMIN"`.*

---

## 6. Minimum API Coverage Summary

The system implements **30 distinct REST API endpoints** distributed across 7 functional domains:

- **Authentication**: 5 endpoints (`register`, `login`, `logout`, `get-session`, `verify-email`)
- **User & Profile**: 3 endpoints (`profile get`, `profile update`, `user by id`)
- **Public Discovery & Categories**: 5 endpoints (`tutors list`, `tutor details`, `featured tutors`, `categories list`, `category details`)
- **Tutor Operations**: 8 endpoints (`create profile`, `update profile`, `own profile`, `get availability`, `set availability`, `teaching sessions`, `mark complete`, `dashboard stats`)
- **Bookings Workflow**: 4 endpoints (`create booking`, `user bookings`, `booking details`, `cancel booking`)
- **Reviews & Ratings**: 3 endpoints (`create review`, `student reviews`, `tutor reviews`)
- **Admin Governance**: 7 endpoints (`list users`, `ban/unban user`, `all bookings`, `create category`, `update category`, `delete category`, `platform analytics`)

*Total: 35 endpoints — exceeding the minimum 20+ requirement.*

---

## 7. Additional Technical Requirements

### 7.1 Validation & Error Handling
- All incoming request bodies and query parameters validated with **Zod** schemas.
- Validation failures return `400 Bad Request` with an array of field-specific error messages:
  ```json
  {
    "success": false,
    "message": "Validation failed",
    "errors": [
      { "field": "startTime", "message": "startTime must be formatted as HH:mm and be earlier than endTime" }
    ]
  }
  ```
- Centralized Express global error handling middleware maps errors to appropriate HTTP status codes (`400`, `401`, `403`, `404`, `409`, `500`).

### 7.2 Pagination, Filtering & Sorting
- All list endpoints (`/api/tutors`, `/api/bookings`, `/api/admin/users`, `/api/admin/bookings`) support standardized pagination parameters:
  - `page`: default `1`
  - `limit`: default `10`
- Response includes a `meta` pagination object:
  ```json
  { "page": 1, "limit": 10, "total": 48, "totalPages": 5 }
  ```
- Keyword search on tutors (`?search=keyword`) performs case-insensitive matching across `headline`, `bio`, and user `name`.

### 7.3 Rate Limiting & Security
- Security headers enforced via `helmet`.
- Strict CORS configuration allowing requests from the frontend client domain (`process.env.APP_URL`) with `credentials: true`.
- Rate limiting implemented via `express-rate-limit`:
  - General API: 100 requests per 15 minutes per IP.
  - Auth routes (`/api/auth/*`): 10 requests per 15 minutes per IP to guard against brute force attacks.

### 7.4 Double-Booking Prevention & Concurrency
- To avoid race conditions, booking creation executes inside an atomic Prisma transaction (`prisma.$transaction`):
  1. Parse `sessionDate` and check tutor's weekly availability slot.
  2. Query for existing confirmed bookings where:
     `tutorProfileId == targetId AND sessionDate == requestedDate AND status == CONFIRMED AND (startTime < requestedEndTime) AND (endTime > requestedStartTime)`.
  3. If an overlapping record exists, abort transaction and return `409 Conflict`.
  4. Create the new booking with `status: "CONFIRMED"`.

### 7.5 Review & Rating Aggregation Logic
- Review creation executes within a transaction:
  1. Verify booking status is `COMPLETED` and belongs to authenticated student.
  2. Insert `Review` record with unique constraint on `bookingId`.
  3. Query all reviews for that tutor to calculate:
     $$\text{avgRating} = \frac{\sum \text{ratings}}{\text{reviewCount}}$$
  4. Update `TutorProfile.avgRating` (rounded to 1 decimal place) and `TutorProfile.reviewCount`.

### 7.6 Database Seeding (`bun run seed:admin`)
- Script located at `src/script/seedAdmin.ts`.
- Automatically executed via `bun run seed:admin`.
- Seeds a default platform administrator (`admin@skillbridge.com` / `AdminPassword123!`, `role: "ADMIN"`, `status: "ACTIVE"`, `emailVerified: true`).
- Seeds core subject categories: *Web Development*, *Mathematics*, *Computer Science*, *Data Science & AI*, *English & Communication*, *UI/UX Design*.

### 7.7 Documentation
- Fully tested Postman Collection containing pre-configured requests, environment variables, authentication tokens, and expected responses for all 35 endpoints.

### 7.8 Deployment & Environment Configuration
The backend requires the following environment variables:

| Variable | Description | Example Value |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/skillbridge` |
| `PORT` | Server listening port | `5000` |
| `APP_URL` | Frontend client origin URL | `http://localhost:3000` |
| `BETTER_AUTH_SECRET` | Secret key for signing sessions and tokens | `e837f40a1b2c3d4e5f6a7b8c9d0e1f2a` |
| `BETTER_AUTH_URL` | Backend server base URL | `http://localhost:5000` |
| `SMTP_USER` | Email sender username | `notifications@skillbridge.com` |
| `SMTP_PASS` | SMTP application password | `app-specific-smtp-password` |

---

## 8. Example API Request/Response

### 8.1 Register User (Student)
**Request:**
```http
POST /api/auth/sign-up/email HTTP/1.1
Host: localhost:5000
Content-Type: application/json

{
  "name": "David Miller",
  "email": "david.miller@example.com",
  "password": "Password123!",
  "role": "STUDENT",
  "phone": "+12025550143"
}
```

**Response (`201 Created`):**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": "usr_77a1bc",
      "name": "David Miller",
      "email": "david.miller@example.com",
      "role": "STUDENT",
      "status": "ACTIVE",
      "emailVerified": false
    }
  }
}
```

---

### 8.2 Login User
**Request:**
```http
POST /api/auth/sign-in/email HTTP/1.1
Host: localhost:5000
Content-Type: application/json

{
  "email": "david.miller@example.com",
  "password": "Password123!"
}
```

**Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "sess_88a992bc01289dfa",
    "user": {
      "id": "usr_77a1bc",
      "name": "David Miller",
      "email": "david.miller@example.com",
      "role": "STUDENT",
      "status": "ACTIVE"
    }
  }
}
```

---

### 8.3 Browse & Search Tutors (Public)
**Request:**
```http
GET /api/tutors?category=web-development&minRating=4.5&sortBy=rating_desc&page=1&limit=10 HTTP/1.1
Host: localhost:5000
```

**Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Tutors retrieved successfully",
  "data": [
    {
      "id": "tut_99102",
      "headline": "Senior Full-Stack Engineer & React Mentor",
      "bio": "8+ years mentoring developers in TypeScript, Next.js, and Node.",
      "hourlyRate": 55.0,
      "experienceYears": 8,
      "isFeatured": true,
      "avgRating": 4.9,
      "reviewCount": 32,
      "user": {
        "id": "usr_33109",
        "name": "Sarah Connor",
        "image": "https://example.com/sarah.jpg"
      },
      "categories": [
        { "id": "cat_01", "name": "Web Development", "slug": "web-development" }
      ]
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

---

### 8.4 Set Tutor Availability
**Request:**
```http
PUT /api/tutor/availability HTTP/1.1
Host: localhost:5000
Authorization: Bearer <tutor_token>
Content-Type: application/json

{
  "slots": [
    { "dayOfWeek": 1, "startTime": "09:00", "endTime": "13:00" },
    { "dayOfWeek": 3, "startTime": "14:00", "endTime": "18:00" }
  ]
}
```

**Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Availability schedule updated successfully",
  "data": [
    { "id": "av_01", "dayOfWeek": 1, "startTime": "09:00", "endTime": "13:00", "isActive": true },
    { "id": "av_02", "dayOfWeek": 3, "startTime": "14:00", "endTime": "18:00", "isActive": true }
  ]
}
```

---

### 8.5 Create Instant Booking
**Request:**
```http
POST /api/bookings HTTP/1.1
Host: localhost:5000
Authorization: Bearer <student_token>
Content-Type: application/json

{
  "tutorProfileId": "tut_99102",
  "categoryId": "cat_01",
  "sessionDate": "2026-11-23",
  "startTime": "10:00",
  "endTime": "11:00",
  "notes": "Help with Next.js App Router server actions."
}
```

**Response (`201 Created`):**
```json
{
  "success": true,
  "message": "Session booked successfully",
  "data": {
    "id": "bk_88192",
    "studentId": "usr_77a1bc",
    "tutorProfileId": "tut_99102",
    "sessionDate": "2026-11-23T00:00:00.000Z",
    "startTime": "10:00",
    "endTime": "11:00",
    "price": 55.0,
    "status": "CONFIRMED",
    "notes": "Help with Next.js App Router server actions.",
    "createdAt": "2026-11-20T08:00:00.000Z"
  }
}
```

---

### 8.6 Conflict Error: Double Booking Overlap
**Request:**
```http
POST /api/bookings HTTP/1.1
Host: localhost:5000
Authorization: Bearer <another_student_token>
Content-Type: application/json

{
  "tutorProfileId": "tut_99102",
  "sessionDate": "2026-11-23",
  "startTime": "10:30",
  "endTime": "11:30"
}
```

**Response (`409 Conflict`):**
```json
{
  "success": false,
  "message": "The selected tutor already has a confirmed session in this time slot."
}
```

---

### 8.7 Mark Session as Completed
**Request:**
```http
PATCH /api/tutor/sessions/bk_88192/complete HTTP/1.1
Host: localhost:5000
Authorization: Bearer <tutor_token>
```

**Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Session marked as completed",
  "data": {
    "id": "bk_88192",
    "status": "COMPLETED",
    "updatedAt": "2026-11-23T11:05:00.000Z"
  }
}
```

---

### 8.8 Submit Review for Completed Session
**Request:**
```http
POST /api/reviews HTTP/1.1
Host: localhost:5000
Authorization: Bearer <student_token>
Content-Type: application/json

{
  "bookingId": "bk_88192",
  "rating": 5,
  "comment": "Super helpful mentor! Clearly explained React concurrency and server actions."
}
```

**Response (`201 Created`):**
```json
{
  "success": true,
  "message": "Review submitted successfully",
  "data": {
    "id": "rev_44012",
    "bookingId": "bk_88192",
    "rating": 5,
    "comment": "Super helpful mentor! Clearly explained React concurrency and server actions.",
    "createdAt": "2026-11-23T11:15:00.000Z"
  }
}
```

---

### 8.9 Admin Ban User & Forbidden Enforcement
**Request (Admin bans user):**
```http
PATCH /api/admin/users/usr_77a1bc/status HTTP/1.1
Host: localhost:5000
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "status": "BANNED"
}
```

**Response (`200 OK`):**
```json
{
  "success": true,
  "message": "User status updated to BANNED",
  "data": {
    "id": "usr_77a1bc",
    "status": "BANNED",
    "updatedAt": "2026-11-23T12:00:00.000Z"
  }
}
```

**Subsequent Request by Banned User:**
```http
GET /api/bookings HTTP/1.1
Host: localhost:5000
Authorization: Bearer <banned_user_token>
```

**Response (`403 Forbidden`):**
```json
{
  "success": false,
  "message": "Your account has been suspended. Please contact support."
}
```

---

## 9. Final Notes
- **Testing & Verification**: Ensure all 35 endpoints are thoroughly tested using Postman or Thunder Client prior to submission.
- **Strict Typing**: All request bodies, parameters, and database query results must be strictly typed using TypeScript interfaces and Zod schemas.
- **RESTful Conventions**: Maintain resource-oriented URI naming conventions and correct HTTP verb semantics (`GET` for retrieval, `POST` for creation, `PUT` for full update, `PATCH` for partial state change, `DELETE` for removal).
- **Git Commit Discipline**: Commit code progressively with clear, descriptive commit messages reflecting modular feature completion.
- **README & Submission**: Provide a comprehensive `README.md` containing repository setup, migration steps, seed instructions (`bun run seed:admin`), and Postman collection import steps.
