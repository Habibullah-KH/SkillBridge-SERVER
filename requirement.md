# SkillBridge — Backend Requirements Specification (`requirement.md`)

## 1. Project Overview
SkillBridge is a RESTful backend API powering a tutoring marketplace platform. It manages user authentication, role-based access control (RBAC), tutor profile discovery, availability scheduling, instant session booking, post-session reviews, and platform administration.

---

## 2. User Roles & Access Control (RBAC)

All protected routes require a valid **JWT Bearer Token** in the `Authorization` header (`Authorization: Bearer <token>`).

| Role | Registration | Account Status Enforcement | Core Capabilities |
| :--- | :--- | :--- | :--- |
| **`STUDENT`** | Self-registered via `/api/auth/register` | Blocked from login/API access if `status === "BANNED"` | Browse tutors, book sessions, cancel own bookings, leave reviews on completed sessions, update own profile. |
| **`TUTOR`** | Self-registered via `/api/auth/register` | Blocked from login/API access if `status === "BANNED"` | Manage tutor profile, set availability slots, view assigned sessions, mark sessions as `COMPLETED`. |
| **`ADMIN`** | **Database Seeded Only** (Cannot register via public API) | Full platform access | View all users, ban/unban users, view all bookings, create/update/delete subject categories, view platform stats. |

---

## 3. Database Schema Design

### 3.1 `Users`
Stores core authentication and account metadata for all roles.
* `id`: `UUID / ObjectId` (Primary Key)
* `name`: `String` (Required)
* `email`: `String` (Required, Unique, Indexed)
* `password`: `String` (Required, Hashed via bcrypt/argon2, excluded from API responses)
* `role`: `Enum("STUDENT", "TUTOR", "ADMIN")` (Required, Default: `"STUDENT"`)
* `status`: `Enum("ACTIVE", "BANNED")` (Default: `"ACTIVE"`)
* `avatar`: `String` (Optional URL)
* `phone`: `String` (Optional)
* `createdAt`: `DateTime`
* `updatedAt`: `DateTime`

### 3.2 `TutorProfiles`
Extended profile linked 1-to-1 with a `User` whose role is `TUTOR`.
* `id`: `UUID / ObjectId` (Primary Key)
* `userId`: `Foreign Key -> Users.id` (Unique, Required)
* `bio`: `Text` (Required)
* `headline`: `String` (e.g., *"Senior Full-Stack Engineer & CS Mentor"*)
* `hourlyRate`: `Decimal / Float` (Required, >= 0)
* `experienceYears`: `Integer` (Default: 0)
* `subjects`: `Array<String>` (e.g., `["React", "Node.js", "Algorithms"]`)
* `categoryId`: `Foreign Key -> Categories.id` (Required)
* `availability`: `JSON / Array<Object>` (Structured weekly or dated time slots, e.g., `[{ "day": "Monday", "startTime": "09:00", "endTime": "12:00" }]`)
* `averageRating`: `Float` (Default: `0.0`, recalculated automatically when a new review is added)
* `totalReviews`: `Integer` (Default: `0`, incremented when a new review is added)
* `isFeatured`: `Boolean` (Default: `false` — used for landing page featured tutors)
* `createdAt`: `DateTime`
* `updatedAt`: `DateTime`

### 3.3 `Categories`
Subject classifications managed by Admins.
* `id`: `UUID / ObjectId` (Primary Key)
* `name`: `String` (Required, Unique — e.g., *"Web Development"*, *"Mathematics"*, *"Languages"*)
* `slug`: `String` (Required, Unique — URL-friendly identifier)
* `description`: `String` (Optional)
* `icon`: `String` (Optional icon name or URL)
* `createdAt`: `DateTime`
* `updatedAt`: `DateTime`

### 3.4 `Bookings`
Tracks tutoring sessions between a `STUDENT` and a `TUTOR`.
* `id`: `UUID / ObjectId` (Primary Key)
* `studentId`: `Foreign Key -> Users.id` (Required)
* `tutorId`: `Foreign Key -> TutorProfiles.id` (or `Users.id` with role `TUTOR`, Required)
* `subject`: `String` (Required)
* `sessionDate`: `Date / DateTime` (Required)
* `startTime`: `String` (Required — e.g., `"10:00"`)
* `endTime`: `String` (Required — e.g., `"11:00"`)
* `totalPrice`: `Decimal / Float` (Calculated from tutor's `hourlyRate` * duration)
* `status`: `Enum("CONFIRMED", "COMPLETED", "CANCELLED")` (Default: `"CONFIRMED"`)
* `notes`: `Text` (Optional student notes for the tutor)
* `createdAt`: `DateTime`
* `updatedAt`: `DateTime`

### 3.5 `Reviews`
Post-session feedback left by students for tutors.
* `id`: `UUID / ObjectId` (Primary Key)
* `bookingId`: `Foreign Key -> Bookings.id` (Unique, Required — ensures 1 review per completed session)
* `studentId`: `Foreign Key -> Users.id` (Required)
* `tutorId`: `Foreign Key -> TutorProfiles.id` (Required)
* `rating`: `Integer` (Required, Min: `1`, Max: `5`)
* `comment`: `Text` (Required)
* `createdAt`: `DateTime`

---

## 4. Core Business Logic & Validation Rules

1. **Admin Seeding**:
   * Public `/api/auth/register` must reject `"role": "ADMIN"` with `403 Forbidden` or `400 Bad Request`.
   * Database seed script must initialize at least one `ADMIN` user and default `Categories`.
2. **Account Banning**:
   * If an `ADMIN` sets a user's status to `BANNED`, the user cannot log in (`403 Forbidden`), and any active JWT belonging to that user must be rejected by auth middleware.
3. **Instant Booking & Conflict Prevention**:
   * New bookings start immediately in `CONFIRMED` status.
   * Students cannot book themselves (`studentId !== tutor.userId`).
   * **Double-Booking Check**: Reject booking (`409 Conflict`) if the tutor already has a `CONFIRMED` booking overlapping the requested `sessionDate`, `startTime`, and `endTime`.
   * **Availability Check**: Requested slot must fall within the tutor's configured `availability`.
4. **Booking Status Transitions**:
   * `CONFIRMED` -> `COMPLETED`: Allowed **only** by the assigned `TUTOR` (or `ADMIN`).
   * `CONFIRMED` -> `CANCELLED`: Allowed by the `STUDENT` who booked it (or `ADMIN`).
   * Once `COMPLETED` or `CANCELLED`, status cannot be reverted.
5. **Review Eligibility & Rating Aggregation**:
   * A student can leave a review **only if**:
     * The `bookingId` belongs to that student.
     * The booking status is `COMPLETED`.
     * No review exists yet for that `bookingId`.
   * Creating a review must atomically update the tutor's `totalReviews` and recalculate `averageRating`.

---

## 5. API Endpoints Specification

### Standard Response Envelope
All responses should follow a consistent JSON structure:
```json
// Success
{
  "success": true,
  "message": "Operation successful",
  "data": { ... },
  "meta": { "page": 1, "limit": 10, "total": 50 } // Included on paginated lists
}

// Error
{
  "success": false,
  "message": "Descriptive error message",
  "errors": [ ... ] // Optional validation details
}