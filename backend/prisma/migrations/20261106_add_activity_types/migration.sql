-- Справочник «Виды деятельности» (ОКВЭД): основной + дополнительные виды
CREATE TABLE IF NOT EXISTS "activity_types" (
    "id" TEXT NOT NULL,
    "okved" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_main" BOOLEAN NOT NULL DEFAULT false,
    "organization_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "activity_types_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "activity_types_organization_id_idx" ON "activity_types"("organization_id");
CREATE INDEX IF NOT EXISTS "activity_types_is_main_idx" ON "activity_types"("is_main");

DO $$ BEGIN
    ALTER TABLE "activity_types" ADD CONSTRAINT "activity_types_updated_by_fkey"
        FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
