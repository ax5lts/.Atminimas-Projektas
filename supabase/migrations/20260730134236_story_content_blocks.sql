-- Ordered story content blocks, with a flattened legacy text representation.
-- The browser may insert the new column only while creating its own private
-- profile; later edits continue to pass through the authenticated Edge Function.

alter table public.profiliai
  add column if not exists story_blocks_json jsonb not null default '[]'::jsonb;

grant insert (story_blocks_json)
  on table public.profiliai to authenticated;

create or replace function private.normalize_profile_story_blocks()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $normalize_story_blocks$
declare
  item jsonb;
  media_item jsonb;
  normalized jsonb := '[]'::jsonb;
  block_type text;
  raw_text text;
  block_text text;
  legacy_text text;
  joined_text text := '';
  raw_photo_order text;
  photo_order_number numeric;
  photo_order_value integer;
  flattened_length integer := 0;
  separator_length integer;
  available_length integer;
begin
  if new.story_blocks_json is null then
    new.story_blocks_json := '[]'::jsonb;
  end if;

  if jsonb_typeof(new.story_blocks_json) is distinct from 'array' then
    raise exception using
      errcode = '23514',
      message = 'story_blocks_json must be a JSON array';
  end if;

  if octet_length(new.story_blocks_json::text) > 65536 then
    raise exception using
      errcode = '23514',
      message = 'story_blocks_json may contain at most 64 KB';
  end if;

  for item in
    select source.value
    from jsonb_array_elements(new.story_blocks_json)
      with ordinality as source(value, ordinal)
    where source.ordinal <= 40
    order by source.ordinal
  loop
    if jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item -> 'type') is distinct from 'string'
    then
      continue;
    end if;

    block_type := item ->> 'type';
    if block_type = 'text' then
      if jsonb_typeof(item -> 'text') is distinct from 'string' then
        continue;
      end if;

      raw_text := btrim(item ->> 'text');
      separator_length := case
        when raw_text <> '' and joined_text <> '' then 2
        else 0
      end;
      available_length := greatest(
        0,
        10000 - flattened_length - separator_length
      );
      block_text := rtrim(left(raw_text, available_length));

      normalized := normalized || jsonb_build_array(
        jsonb_build_object(
          'type', 'text',
          'text', block_text
        )
      );

      if block_text <> '' then
        if joined_text <> '' then
          joined_text := joined_text || E'\n\n';
        end if;
        joined_text := joined_text || block_text;
        flattened_length := flattened_length
          + separator_length
          + char_length(block_text);
      end if;
    elsif block_type = 'photo' then
      if jsonb_typeof(item -> 'photoOrder') is null
        or jsonb_typeof(item -> 'photoOrder') not in ('number', 'string')
      then
        continue;
      end if;

      raw_photo_order := btrim(item ->> 'photoOrder');
      if raw_photo_order !~ '^\d+(?:\.0+)?$' then
        continue;
      end if;

      photo_order_number := raw_photo_order::numeric;
      if photo_order_number <> trunc(photo_order_number)
        or photo_order_number not between 1 and 8
      then
        continue;
      end if;

      photo_order_value := photo_order_number::integer;
      normalized := normalized || jsonb_build_array(
        jsonb_build_object(
          'type', 'photo',
          'photoOrder', photo_order_value
        )
      );
    end if;
  end loop;

  -- Rows created before content blocks existed, and older clients that still
  -- submit only `tekstas_200`, become a single text block without data loss.
  legacy_text := btrim(left(coalesce(new.tekstas_200, ''), 10000));
  if normalized = '[]'::jsonb and legacy_text <> '' then
    normalized := jsonb_build_array(
      jsonb_build_object(
        'type', 'text',
        'text', legacy_text
      )
    );
    joined_text := legacy_text;

    -- A client opened before this migration will not know the new column.
    -- Preserve its image sequence by appending legacy media as photo blocks.
    for media_item in
      select source.value
      from jsonb_array_elements(
        case
          when jsonb_typeof(new.media_json) = 'array' then new.media_json
          else '[]'::jsonb
        end
      ) with ordinality as source(value, ordinal)
      where source.ordinal <= 10
      order by source.ordinal
    loop
      if jsonb_typeof(media_item) is distinct from 'object'
        or media_item ->> 'type' <> 'image'
        or jsonb_typeof(media_item -> 'order') is null
        or jsonb_typeof(media_item -> 'order') not in ('number', 'string')
      then
        continue;
      end if;

      raw_photo_order := btrim(media_item ->> 'order');
      if raw_photo_order !~ '^\d+(?:\.0+)?$' then
        continue;
      end if;

      photo_order_number := raw_photo_order::numeric;
      if photo_order_number <> trunc(photo_order_number)
        or photo_order_number not between 1 and 8
      then
        continue;
      end if;

      normalized := normalized || jsonb_build_array(
        jsonb_build_object(
          'type', 'photo',
          'photoOrder', photo_order_number::integer
        )
      );
    end loop;
  end if;

  new.story_blocks_json := normalized;
  new.tekstas_200 := nullif(joined_text, '');
  return new;
end;
$normalize_story_blocks$;

revoke all on function private.normalize_profile_story_blocks()
  from public, anon, authenticated;

drop trigger if exists normalize_profile_story_blocks on public.profiliai;
create trigger normalize_profile_story_blocks
  before insert or update of story_blocks_json, tekstas_200
  on public.profiliai
  for each row
  execute function private.normalize_profile_story_blocks();

-- Existing rows intentionally remain `[]`: this preserves their established
-- legacy page layout until the owner opens and saves them in the block editor.
-- The trigger converts legacy `tekstas_200` on the next content write.
