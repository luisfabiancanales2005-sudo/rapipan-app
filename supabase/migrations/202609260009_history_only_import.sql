-- Import the reviewed workbook as historical facts, without fictitious editable closings.
alter table public.legacy_imports drop constraint if exists legacy_imports_closed_days_check;
alter table public.legacy_imports add constraint legacy_imports_closed_days_check check (closed_days >= 0);
revoke execute on function public.import_legacy_closures_once(jsonb) from authenticated;

create function public.import_legacy_history_once(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  business_uuid uuid;
  source_item jsonb;
  historical_item jsonb;
  attestation_item jsonb;
  day_value date;
  previous_day date;
  archive_count integer := 0;
  historical_count integer := 0;
  sale_count integer := 0;
  sales_total bigint := 0;
  profit_total bigint := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  business_uuid := public.current_business_id();
  if business_uuid <> '00000000-0000-4000-8000-000000000001'::uuid then
    raise exception 'This import is only for the seeded Rapipan business';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or p_payload->>'sourceSha256' <> '2b8a213a0eea13c68161717fd897fd21beb96abf0c63c90770e93886eea98cf1'
     or jsonb_typeof(p_payload->'archiveRows') <> 'array'
     or jsonb_typeof(p_payload->'legacyDays') <> 'array'
     or jsonb_typeof(p_payload->'creditAttestations') <> 'array'
     or jsonb_array_length(p_payload->'archiveRows') <> 68
     or jsonb_array_length(p_payload->'legacyDays') <> 24
     or jsonb_array_length(p_payload->'creditAttestations') <> 2 then
    raise exception 'The reviewed Excel import payload is invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(business_uuid::text, 0));
  if exists (select 1 from public.legacy_imports where business_id = business_uuid)
     or exists (select 1 from public.daily_closures where business_id = business_uuid)
     or exists (select 1 from public.legacy_daily_facts where business_id = business_uuid) then
    raise exception 'Import is one-time and requires an empty business';
  end if;

  for source_item in select value from jsonb_array_elements(p_payload->'archiveRows') loop
    if source_item->>'sheet' not in
       ('Ventas_Diarias', 'Creditos_Clientes', 'Gastos_Generales', 'Sorteos_Domingos', 'Notas')
       or jsonb_typeof(source_item->'cells') <> 'object'
       or jsonb_typeof(source_item->'calculatedColumns') <> 'array'
       or jsonb_typeof(source_item->'correction') <> 'object' then
      raise exception 'Invalid archived source row';
    end if;
    insert into public.legacy_source_rows
      (business_id, sheet_name, source_row, record_date, cells, calculated_columns, correction)
    values (business_uuid, source_item->>'sheet', (source_item->>'row')::integer,
            (source_item->>'recordDate')::date, source_item->'cells', source_item->'calculatedColumns',
            source_item->'correction');
    archive_count := archive_count + 1;
    if source_item->>'sheet' = 'Ventas_Diarias' then sale_count := sale_count + 1; end if;
  end loop;
  if sale_count <> 35 then raise exception 'Expected 35 sales rows'; end if;

  for historical_item in select value from jsonb_array_elements(p_payload->'legacyDays') loop
    day_value := (historical_item->>'operatingDate')::date;
    if day_value is null or day_value < '2026-08-24'::date or day_value > '2026-09-25'::date
       or (previous_day is not null and day_value <= previous_day) then
      raise exception 'Historical days must be unique and chronological';
    end if;
    insert into public.legacy_daily_facts
      (business_id, operating_date, source_rows, purchased_quantity, sold_quantity,
       gifted_quantity, consumed_quantity, sales_cents, purchase_cost_cents,
       commission_cents, general_expenses_cents, commercial_adjustment_cents,
       profit_cents, fabiana_profit_cents, fabian_profit_cents,
       fabiana_capital_cents, fabian_capital_cents,
       fabiana_expenses_paid_cents, fabian_expenses_paid_cents,
       capital_evidence, cash_settlement_status)
    values
      (business_uuid, day_value,
       array(select jsonb_array_elements_text(historical_item->'sourceRows')::integer),
       (historical_item->>'purchasedQuantity')::integer,
       (historical_item->>'soldQuantity')::integer,
       (historical_item->>'giftedQuantity')::integer,
       (historical_item->>'consumedQuantity')::integer,
       (historical_item->>'salesCents')::bigint,
       (historical_item->>'purchaseCostCents')::bigint,
       (historical_item->>'commissionCents')::bigint,
       (historical_item->>'generalExpensesCents')::bigint,
       (historical_item->>'commercialAdjustmentCents')::bigint,
       (historical_item->>'profitCents')::bigint,
       (historical_item->>'fabianaProfitCents')::bigint,
       (historical_item->>'fabianProfitCents')::bigint,
       (historical_item->>'fabianaCapitalCents')::bigint,
       (historical_item->>'fabianCapitalCents')::bigint,
       (historical_item->>'fabianaExpensesPaidCents')::bigint,
       (historical_item->>'fabianExpensesPaidCents')::bigint,
       historical_item->>'capitalEvidence', historical_item->>'cashSettlementStatus');
    previous_day := day_value;
    historical_count := historical_count + 1;
    sales_total := sales_total + (historical_item->>'salesCents')::bigint;
    profit_total := profit_total + (historical_item->>'profitCents')::bigint;
  end loop;
  if sales_total <> 335200 or profit_total <> 89510 then
    raise exception 'Historical totals do not match the reviewed Excel';
  end if;

  for attestation_item in select value from jsonb_array_elements(p_payload->'creditAttestations') loop
    if (attestation_item->>'creditRow')::integer not in (8, 9)
       or attestation_item->>'status' <> 'reported_paid_assumed_date'
       or (attestation_item->>'paymentDate')::date <> '2026-09-26'::date
       or (attestation_item->>'amountCents')::bigint <> 900
       or not exists (select 1 from public.legacy_source_rows
                      where business_id = business_uuid and sheet_name = 'Creditos_Clientes'
                        and source_row = (attestation_item->>'creditRow')::integer
                        and cells->>'F' = 'Pendiente' and cells->>'G' is null
                        and (cells->>'E')::numeric = 9) then
      raise exception 'Invalid user-attested credit collection';
    end if;
    insert into public.legacy_credit_attestations (business_id, credit_row, status, payment_date, amount_cents)
      values (business_uuid, (attestation_item->>'creditRow')::integer,
              attestation_item->>'status', (attestation_item->>'paymentDate')::date,
              (attestation_item->>'amountCents')::bigint);
  end loop;

  insert into public.legacy_imports
    (business_id, source_sha256, imported_by, closed_days, historical_days, credit_payments, archived_rows)
  values (business_uuid, p_payload->>'sourceSha256', auth.uid(), 0, historical_count, 0, archive_count);
  return jsonb_build_object('closedDays', 0, 'historicalDays', historical_count,
                            'archivedRows', archive_count, 'sourceSha256', p_payload->>'sourceSha256');
end;
$$;
revoke all on function public.import_legacy_history_once(jsonb) from public, anon;
grant execute on function public.import_legacy_history_once(jsonb) to authenticated;
