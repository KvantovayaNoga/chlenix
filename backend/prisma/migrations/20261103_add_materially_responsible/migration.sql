-- МОЛ (материально ответственное лицо) для оборудования и виртуальных машин.
-- Назначается сотрудник, на подотчёте которого числится техника.

ALTER TABLE "equipment"
  ADD COLUMN IF NOT EXISTS "materially_responsible_employee_id" UUID;

ALTER TABLE "equipment"
  DROP CONSTRAINT IF EXISTS "equipment_materially_responsible_employee_id_fkey";

ALTER TABLE "equipment"
  ADD CONSTRAINT "equipment_materially_responsible_employee_id_fkey"
  FOREIGN KEY ("materially_responsible_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "equipment_materially_responsible_employee_id_idx"
  ON "equipment"("materially_responsible_employee_id");

ALTER TABLE "virtual_machines"
  ADD COLUMN IF NOT EXISTS "materially_responsible_employee_id" UUID;

ALTER TABLE "virtual_machines"
  DROP CONSTRAINT IF EXISTS "virtual_machines_materially_responsible_employee_id_fkey";

ALTER TABLE "virtual_machines"
  ADD CONSTRAINT "virtual_machines_materially_responsible_employee_id_fkey"
  FOREIGN KEY ("materially_responsible_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "virtual_machines_materially_responsible_employee_id_idx"
  ON "virtual_machines"("materially_responsible_employee_id");
