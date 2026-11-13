CREATE TABLE "backend_healthchecks" (
    "id" UUID NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backend_healthchecks_pkey" PRIMARY KEY ("id")
);
