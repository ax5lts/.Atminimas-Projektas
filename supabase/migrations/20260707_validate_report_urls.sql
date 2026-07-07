alter table public.turinio_pranesimai
  drop constraint if exists turinio_pranesimai_content_url_https;
alter table public.turinio_pranesimai
  add constraint turinio_pranesimai_content_url_https
  check (content_url ~* '^https?://');
