-- Руководитель организации: связь с сотрудником штатного расписания
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "director_employee_id" TEXT;

-- Уникальность: у организации может быть не более одного руководителя-сотрудника
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_director_employee_id_key" ON "organizations"("director_employee_id");

-- FK на сотрудников (SET NULL при удалении сотрудника)
DO $$ BEGIN
  ALTER TABLE "organizations"
    ADD CONSTRAINT "organizations_director_employee_id_fkey"
    FOREIGN KEY ("director_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Поле «Отрасль» вычищено из структуры проекта
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "industry";
