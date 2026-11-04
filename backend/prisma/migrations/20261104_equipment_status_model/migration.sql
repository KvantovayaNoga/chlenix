-- Статусная модель оборудования: «Состояние» -> «Статус».
-- Новые значения: эксплуатация, эксплуатация с ограничениями (обязательна
-- причина — defect_note), резерв, ремонт, снято с учета, утерян/украдено,
-- непригодно к эксплуатации, для списания.
-- Колонка equipment.condition — TEXT с CHECK,
-- поэтому миграция не затрагивает enum PostgreSQL.

ALTER TABLE equipment DROP CONSTRAINT IF EXISTS equipment_condition_check;

-- Перенос старых значений в новую модель:
UPDATE equipment SET condition = 'exploitation'            WHERE condition IN ('new', 'good');
UPDATE equipment SET condition = 'exploitation_restricted'  WHERE condition = 'satisfactory';
UPDATE equipment SET condition = 'repair'                   WHERE condition = 'needs_repair';
UPDATE equipment SET condition = 'for_writeoff'             WHERE condition = 'written_off';

-- Подстраховка на случай произвольных значений в данных.
UPDATE equipment SET condition = 'exploitation'
WHERE condition NOT IN (
  'exploitation', 'exploitation_restricted', 'reserve', 'repair',
  'removed_from_register', 'lost_stolen', 'unfit', 'for_writeoff'
);

ALTER TABLE equipment ADD COLUMN IF NOT EXISTS defect_note TEXT;

ALTER TABLE equipment ADD CONSTRAINT equipment_condition_check
CHECK (condition IN (
  'exploitation', 'exploitation_restricted', 'reserve', 'repair',
  'removed_from_register', 'lost_stolen', 'unfit', 'for_writeoff'
));

COMMENT ON COLUMN equipment.defect_note IS
  'Дефект или причина ограничений; обязателен при статусе exploitation_restricted (проверка на уровне API)';
