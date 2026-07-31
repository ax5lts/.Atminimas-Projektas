-- Persist a bounded font scale for story text blocks.
-- Photo sizing and all existing position controls retain their current limits.

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
  photo_align text;
  photo_fit text;
  raw_offset text;
  raw_width text;
  raw_font_scale text;
  block_offset_x numeric;
  block_offset_y numeric;
  text_font_scale numeric;
  photo_width numeric;
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

    block_offset_x := 0;
    if jsonb_typeof(item -> 'offsetX') in ('number', 'string') then
      raw_offset := btrim(item ->> 'offsetX');
      if raw_offset ~ '^-?\d+(?:\.\d{1,3})?$' then
        block_offset_x := least(70, greatest(-70, raw_offset::numeric));
      end if;
    end if;

    block_offset_y := 0;
    if jsonb_typeof(item -> 'offsetY') in ('number', 'string') then
      raw_offset := btrim(item ->> 'offsetY');
      if raw_offset ~ '^-?\d+(?:\.\d{1,3})?$' then
        block_offset_y := least(320, greatest(-320, raw_offset::numeric));
      end if;
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
      text_font_scale := 100;
      if jsonb_typeof(item -> 'fontScale') in ('number', 'string') then
        raw_font_scale := btrim(item ->> 'fontScale');
        if raw_font_scale ~ '^\d+(?:\.\d{1,3})?$' then
          text_font_scale := least(
            160,
            greatest(70, round(raw_font_scale::numeric))
          );
        end if;
      end if;

      normalized := normalized || jsonb_build_array(
        jsonb_build_object(
          'type', 'text',
          'text', block_text,
          'fontScale', text_font_scale,
          'offsetX', block_offset_x,
          'offsetY', block_offset_y
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
      photo_align := case
        when item ->> 'align' in ('left', 'right') then item ->> 'align'
        else 'full'
      end;
      photo_width := case when photo_align = 'full' then 100 else 42 end;
      if jsonb_typeof(item -> 'widthPct') in ('number', 'string') then
        raw_width := btrim(item ->> 'widthPct');
        if raw_width ~ '^\d+(?:\.\d{1,3})?$' then
          photo_width := least(100, greatest(35, round(raw_width::numeric)));
        end if;
      end if;
      photo_fit := case
        when item ->> 'fit' = 'cover' then 'cover'
        else 'contain'
      end;
      normalized := normalized || jsonb_build_array(
        jsonb_build_object(
          'type', 'photo',
          'photoOrder', photo_order_value,
          'align', photo_align,
          'widthPct', photo_width,
          'fit', photo_fit,
          'offsetX', block_offset_x,
          'offsetY', block_offset_y
        )
      );
    end if;
  end loop;

  legacy_text := btrim(left(coalesce(new.tekstas_200, ''), 10000));
  if normalized = '[]'::jsonb and legacy_text <> '' then
    normalized := jsonb_build_array(
      jsonb_build_object(
        'type', 'text',
        'text', legacy_text,
        'fontScale', 100,
        'offsetX', 0,
        'offsetY', 0
      )
    );
    joined_text := legacy_text;

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
          'photoOrder', photo_order_number::integer,
          'align', 'full',
          'widthPct', 100,
          'fit', 'contain',
          'offsetX', 0,
          'offsetY', 0
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
