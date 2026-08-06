-- Administratoriaus valdomas gamintojo kontaktas ir QR siuntimo auditas.
alter table public.business_profile
  add column if not exists manufacturer_name text
    check (manufacturer_name is null or char_length(manufacturer_name) <= 200),
  add column if not exists manufacturer_email text
    check (
      manufacturer_email is null or (
        char_length(manufacturer_email) <= 254
        and manufacturer_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      )
    );

alter table public.production_jobs
  add column if not exists manufacturer_email_recipient text
    check (
      manufacturer_email_recipient is null or (
        char_length(manufacturer_email_recipient) <= 254
        and manufacturer_email_recipient ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      )
    ),
  add column if not exists manufacturer_email_sent_at timestamptz;

comment on column public.business_profile.manufacturer_email is
  'Administratoriaus nurodytas lentelių gamintojo kontaktas; neviešinamas klientams.';
comment on column public.production_jobs.manufacturer_email_sent_at is
  'Laikas, kai administratorius sėkmingai išsiuntė gamybos SVG gamintojui.';
