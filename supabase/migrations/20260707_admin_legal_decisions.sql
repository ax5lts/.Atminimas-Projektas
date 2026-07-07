alter table public.atsisakymai
  add column if not exists decision_note text,
  add column if not exists decided_at timestamptz;

alter table public.turinio_pranesimai
  add column if not exists decision_note text,
  add column if not exists decided_at timestamptz;
