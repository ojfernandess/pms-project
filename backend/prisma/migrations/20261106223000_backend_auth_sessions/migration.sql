CREATE TABLE "backend_refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backend_refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "backend_refresh_tokens_token_hash_key" ON "backend_refresh_tokens"("token_hash");
CREATE INDEX "backend_refresh_tokens_user_id_idx" ON "backend_refresh_tokens"("user_id");

CREATE TABLE "backend_password_resets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backend_password_resets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "backend_password_resets_token_hash_key" ON "backend_password_resets"("token_hash");
CREATE INDEX "backend_password_resets_user_id_idx" ON "backend_password_resets"("user_id");
