-- Viesoji paieska vykdoma kvieciancio vaidmens teisemis.
-- Politika taikoma tik aktyviems oficialaus registro įrašams.
-- Suteikiamos tik funkcijai reikalingu, viesu stulpeliu SELECT teises.

grant select (id, name, normalized_name) on public.municipalities to anon, authenticated;
grant select (id, municipality_id, name, normalized_name) on public.cemeteries to anon, authenticated;
grant select (id, municipality_id, cemetery_id, section, row, place_number, latitude, longitude, is_active)
  on public.graves to anon, authenticated;
grant select (
  id, municipality_id, cemetery_id, grave_id, first_name, last_name, full_name,
  grave_section, grave_row, grave_place_number,
  normalized_first_name, normalized_last_name, normalized_full_name,
  birth_date, death_date, burial_date, birth_year, death_year, burial_year,
  birth_date_text, death_date_text, burial_date_text, is_active
) on public.deceased_people to anon, authenticated;

create policy "Viesos savivaldybes paieskai"
  on public.municipalities for select to anon, authenticated using (true);
create policy "Viesos kapines paieskai"
  on public.cemeteries for select to anon, authenticated using (true);
create policy "Aktyvios kapavietes paieskai"
  on public.graves for select to anon, authenticated using (is_active);
create policy "Aktyvus velioniu irasai paieskai"
  on public.deceased_people for select to anon, authenticated using (is_active);

alter function public.search_deceased(text,text,text,integer,integer,text,text,integer,integer)
  security invoker;
