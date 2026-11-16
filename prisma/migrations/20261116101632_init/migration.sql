-- CreateTable
CREATE TABLE "Tutor" (
    "id" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "bio" TEXT NOT NULL,
    "hourlyRate" DECIMAL(65,30) NOT NULL,
    "experienceYears" INTEGER NOT NULL,
    "isFeatured" BOOLEAN NOT NULL,
    "avgRating" DOUBLE PRECISION NOT NULL,
    "reviewCount" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Tutor_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Tutor" ADD CONSTRAINT "Tutor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
