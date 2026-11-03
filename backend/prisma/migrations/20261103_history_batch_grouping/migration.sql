-- Группировка истории изменений: несколько полей, изменённых в одном сохранении,
-- объединяются общей записью-заголовком («Обновлено: поле1, поле2…») с деталями
-- (что и с чего на что изменилось) по batch_id.
ALTER TABLE "history_records" ADD COLUMN IF NOT EXISTS "batch_id" TEXT;

CREATE INDEX IF NOT EXISTS "history_records_batch_id_idx" ON "history_records"("batch_id");
