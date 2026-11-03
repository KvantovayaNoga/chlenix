-- Мультиорганизационность пользователей:
-- 1) user_organizations — членство пользователя в организациях (может быть несколько);
-- 2) users.token_version — версия JWT: при переносе пользователя в другую организацию
--    инкрементируется, все ранее выданные токены становятся недействительными (разлогин).

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "token_version" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "user_organizations" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_organizations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_organizations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_organizations_user_id_organization_id_key"
  ON "user_organizations"("user_id", "organization_id");

CREATE INDEX IF NOT EXISTS "user_organizations_user_id_idx" ON "user_organizations"("user_id");
CREATE INDEX IF NOT EXISTS "user_organizations_organization_id_idx" ON "user_organizations"("organization_id");

-- Переносим существующие привязки users.organization_id в таблицу членства,
-- чтобы у всех пользователей с активной организацией появилась запись участника.
INSERT INTO "user_organizations" ("user_id", "organization_id")
SELECT u."id", u."organization_id"
FROM "users" u
JOIN "organizations" o ON o."id" = u."organization_id"
WHERE u."organization_id" IS NOT NULL
ON CONFLICT DO NOTHING;
