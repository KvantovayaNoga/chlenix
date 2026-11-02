-- Добавлены роли: «Специалист по кадрам» (hr_specialist) и «Системный администратор» (sysadmin).
-- PostgreSQL: значения enum добавляются без переписывания таблицы.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'hr_specialist';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'sysadmin';
