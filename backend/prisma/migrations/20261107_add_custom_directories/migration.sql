-- Внутренние справочники (подкатегория «Справочники → Внутренние справочники»):
-- справочник + набор записей. Создание/редактирование — только администратор.
CREATE TABLE IF NOT EXISTS "custom_directories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "organization_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "custom_directories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "custom_directory_items" (
    "id" TEXT NOT NULL,
    "directory_id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_directory_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "custom_directories_organization_id_name_key" ON "custom_directories"("organization_id", "name");
CREATE INDEX IF NOT EXISTS "custom_directories_organization_id_idx" ON "custom_directories"("organization_id");
CREATE UNIQUE INDEX IF NOT EXISTS "custom_directory_items_directory_id_value_key" ON "custom_directory_items"("directory_id", "value");
CREATE INDEX IF NOT EXISTS "custom_directory_items_directory_id_idx" ON "custom_directory_items"("directory_id");

DO $$ BEGIN
    ALTER TABLE "custom_directories" ADD CONSTRAINT "custom_directories_updated_by_fkey"
        FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "custom_directory_items" ADD CONSTRAINT "custom_directory_items_directory_id_fkey"
        FOREIGN KEY ("directory_id") REFERENCES "custom_directories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
