-- Integration smoke test for the linked, otherwise empty Rapipan business.
-- All created rows are rolled back. Do not run against a populated business:
-- create_daily_closure_v2 rejects dates preceding later closed dates.
begin;
select set_config('request.jwt.claim.sub', (select id::text from public.profiles order by id limit 1), true);
set local role authenticated;
do $$
declare
  closing_uuid uuid;
  am_sales bigint;
  pm_sales bigint;
  total_due bigint;
  partner_one bigint;
  partner_two bigint;
  final_payload jsonb;
  initial_payload jsonb;
  version_at timestamptz;
begin
  final_payload := jsonb_build_object(
    'operatingDate', '2026-09-26',
    'purchases', jsonb_build_array(
      jsonb_build_object('productId', '00000000-0000-4000-8000-000000000021', 'quantity', 30, 'unitCostCents', 250, 'shift', 'AM')),
    'capitalContributions', jsonb_build_array(
      jsonb_build_object('ownerId', '00000000-0000-4000-8000-000000000011', 'amountCents', 2500),
      jsonb_build_object('ownerId', '00000000-0000-4000-8000-000000000012', 'amountCents', 5000)),
    'sales', jsonb_build_array(
      jsonb_build_object('productId', '00000000-0000-4000-8000-000000000021', 'quantity', 20, 'unitPriceCents', 450, 'shift', 'PM')),
    'leftovers', jsonb_build_array(
      jsonb_build_object('productId', '00000000-0000-4000-8000-000000000021', 'giftedQuantity', 0, 'consumedQuantity', 0, 'shift', 'AM'),
      jsonb_build_object('productId', '00000000-0000-4000-8000-000000000021', 'giftedQuantity', 10, 'consumedQuantity', 0, 'shift', 'PM')),
    'courierRuns', '[]'::jsonb,
    'expenses', '[]'::jsonb,
    'credit', 'null'::jsonb,
    'openingBusinessCashCents', 0,
    'reservedBusinessCashCents', 0,
    'notes', 'Prueba revertida');
  initial_payload := jsonb_set(final_payload, '{purchases}', jsonb_build_array(
    jsonb_build_object('productId', '00000000-0000-4000-8000-000000000021', 'quantity', 30, 'unitCostCents', 250, 'shift', 'AM')));
  initial_payload := jsonb_set(initial_payload, '{sales}', '[]'::jsonb);
  initial_payload := jsonb_set(initial_payload, '{leftovers}', jsonb_build_array(
    jsonb_build_object('productId', '00000000-0000-4000-8000-000000000021', 'giftedQuantity', 30, 'consumedQuantity', 0, 'shift', 'AM')));
  initial_payload := jsonb_set(initial_payload, '{capitalContributions}', jsonb_build_array(
    jsonb_build_object('ownerId', '00000000-0000-4000-8000-000000000011', 'amountCents', 3750),
    jsonb_build_object('ownerId', '00000000-0000-4000-8000-000000000012', 'amountCents', 3750)));
  closing_uuid := public.create_daily_closure_v2(initial_payload);
  if (select count(*) from public.daily_shift_facts where daily_closure_id = closing_uuid) <> 1 then
    raise exception 'An AM-only close must have one shift fact';
  end if;
  select updated_at into version_at from public.daily_closures where id = closing_uuid;
  perform public.update_daily_closure_v2(closing_uuid, version_at, final_payload);
  select sales_cents into am_sales from public.daily_shift_facts where daily_closure_id = closing_uuid and shift = 'AM';
  select sales_cents into pm_sales from public.daily_shift_facts where daily_closure_id = closing_uuid and shift = 'PM';
  select sum(total_cash_due_cents) into total_due from public.settlements where daily_closure_id = closing_uuid;
  select capital_contributed_cents into partner_one from public.settlements
    where daily_closure_id = closing_uuid and owner_id = '00000000-0000-4000-8000-000000000011';
  select capital_contributed_cents into partner_two from public.settlements
    where daily_closure_id = closing_uuid and owner_id = '00000000-0000-4000-8000-000000000012';
  if am_sales <> 0 or pm_sales <> 9000 or total_due <> 9000
     or partner_one <> 2500 or partner_two <> 5000 then
    raise exception 'AM/PM or capital settlement failed: %, %, %, %, %',
      am_sales, pm_sales, total_due, partner_one, partner_two;
  end if;
end;
$$;
rollback;
