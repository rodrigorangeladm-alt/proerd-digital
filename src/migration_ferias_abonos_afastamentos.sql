-- PROERD DIGITAL: campos de férias, abonos e afastamentos na ficha do efetivo
ALTER TABLE public.personnel
  ADD COLUMN IF NOT EXISTS vacation_month text,
  ADD COLUMN IF NOT EXISTS annual_bonus_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS natalicio_leave_date date,
  ADD COLUMN IF NOT EXISTS edital_leave_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reward_leave_days integer NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE public.personnel ADD CONSTRAINT personnel_annual_bonus_days_limit CHECK (annual_bonus_days >= 0 AND annual_bonus_days <= 5);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.personnel ADD CONSTRAINT personnel_edital_leave_days_nonnegative CHECK (edital_leave_days >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.personnel ADD CONSTRAINT personnel_reward_leave_days_nonnegative CHECK (reward_leave_days >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.personnel ADD CONSTRAINT personnel_vacation_month_valid CHECK (vacation_month IS NULL OR vacation_month IN ('Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Datas efetivas para planejamento e exibição no calendário
ALTER TABLE public.personnel
  ADD COLUMN IF NOT EXISTS annual_bonus_dates date[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS vacation_start_date date,
  ADD COLUMN IF NOT EXISTS vacation_end_date date,
  ADD COLUMN IF NOT EXISTS edital_leave_start_date date,
  ADD COLUMN IF NOT EXISTS edital_leave_end_date date,
  ADD COLUMN IF NOT EXISTS reward_leave_start_date date,
  ADD COLUMN IF NOT EXISTS reward_leave_end_date date;
