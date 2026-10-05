-- Allow a missing operating day to be entered after a later close was saved.
-- create_daily_closure_v2 already recalculates this day and every later
-- settlement in the same transaction; duplicate-date and cash checks remain.
do $$
declare
  definition text;
  guard text := 'raise exception ''A later close exists; register historical dates in order'';';
begin
  definition := pg_get_functiondef('public.create_daily_closure(jsonb)'::regprocedure);
  if position(guard in definition) = 0 then
    raise exception 'Expected historical-date guard was not found; review create_daily_closure before applying';
  end if;
  execute replace(definition, guard, 'null; -- Backdated closes are recalculated by create_daily_closure_v2.');
end;
$$;
