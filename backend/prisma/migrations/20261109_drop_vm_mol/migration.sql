-- П.2: МОЛ убран из виртуальных машин (ВМ — логическая сущность,
-- не может числиться на материальном подотчёте). Оборудование (equipment)
-- сохраняет поле materially_responsible_employee_id без изменений.

-- DropForeignKey
ALTER TABLE "virtual_machines" DROP CONSTRAINT IF EXISTS "virtual_machines_materially_responsible_employee_id_fkey";

-- DropIndex
DROP INDEX IF EXISTS "virtual_machines_materially_responsible_employee_id_idx";

-- AlterTable
ALTER TABLE "virtual_machines" DROP COLUMN IF EXISTS "materially_responsible_employee_id";
