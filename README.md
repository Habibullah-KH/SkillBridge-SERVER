## Entity Relationship Diagrams

erDiagram
    USER ||--o| TUTOR_PROFILE : "has if tutor"
    USER ||--o{ BOOKING : "books as student"
    USER ||--o{ REVIEW : writes
    TUTOR_PROFILE ||--o{ BOOKING : receives
    TUTOR_PROFILE ||--o{ AVAILABILITY : sets
    TUTOR_PROFILE ||--o{ TUTOR_CATEGORY : teaches
    CATEGORY ||--o{ TUTOR_CATEGORY : includes
    TUTOR_PROFILE ||--o{ REVIEW : "rated in"
    BOOKING ||--o| REVIEW : "reviewed by"

```
    USER {
        string id PK
        string name
        string email UK
        string passwordHash
        string role
        string status
        string phone
        string image
        datetime createdAt
        datetime updatedAt
    }
    TUTOR_PROFILE {
        string id PK
        string userId FK
        string headline
        string bio
        decimal hourlyRate
        int experienceYears
        boolean isFeatured
        float avgRating
        int reviewCount
    }
    CATEGORY {
        string id PK
        string name UK
        string slug UK
        string description
    }
    TUTOR_CATEGORY {
        string tutorProfileId PK
        string categoryId PK
    }
    AVAILABILITY {
        string id PK
        string tutorProfileId FK
        int dayOfWeek
        string startTime
        string endTime
    }
    BOOKING {
        string id PK
        string studentId FK
        string tutorProfileId FK
        string categoryId FK
        datetime startAt
        datetime endAt
        decimal price
        string status
        string notes
    }
    REVIEW {
        string id PK
        string bookingId FK
        string studentId FK
        string tutorProfileId FK
        int rating
        string comment
    }

```