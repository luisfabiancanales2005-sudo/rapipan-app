-- One-time import of reviewed closes plus every historical source record.
-- The browser never receives INSERT grants on these tables.
create table public.legacy_imports (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  imported_at timestamptz not null default now(),
  imported_by uuid not null references auth.users(id),
  closed_days integer not null check (closed_days > 0),
  historical_days integer not null check (historical_days > 0),
  credit_payments integer not null check (credit_payments >= 0),
  archived_rows integer not null check (archived_rows > 0)
);
alter table public.legacy_imports enable row level security;
revoke all on table public.legacy_imports from anon, authenticated;
grant select on table public.legacy_imports to authenticated;
create policy legacy_imports_select_own on public.legacy_imports
  for select to authenticated using (business_id = (select public.current_business_id()));

create table public.legacy_source_rows (
  business_id uuid not null references public.businesses(id) on delete cascade,
  sheet_name text not null check (sheet_name in ('Ventas_Diarias', 'Creditos_Clientes', 'Gastos_Generales', 'Sorteos_Domingos', 'Notas')),
  source_row integer not null check (source_row > 0),
  record_date date,
  cells jsonb not null check (jsonb_typeof(cells) = 'object'),
  calculated_columns jsonb not null check (jsonb_typeof(calculated_columns) = 'array'),
  correction jsonb not null default '{}'::jsonb check (jsonb_typeof(correction) = 'object'),
  primary key (business_id, sheet_name, source_row)
);
create index legacy_source_rows_date_idx on public.legacy_source_rows (business_id, record_date);
alter table public.legacy_source_rows enable row level security;
revoke all on table public.legacy_source_rows from anon, authenticated;
grant select on table public.legacy_source_rows to authenticated;
create policy legacy_source_rows_select_own on public.legacy_source_rows
  for select to authenticated using (business_id = (select public.current_business_id()));

create table public.legacy_daily_facts (
  business_id uuid not null references public.businesses(id) on delete cascade,
  operating_date date not null,
  source_rows integer[] not null,
  purchased_quantity integer not null check (purchased_quantity >= 0),
  sold_quantity integer not null check (sold_quantity >= 0),
  gifted_quantity integer not null check (gifted_quantity >= 0),
  consumed_quantity integer not null check (consumed_quantity >= 0),
  sales_cents bigint not null check (sales_cents >= 0),
  purchase_cost_cents bigint not null check (purchase_cost_cents >= 0),
  commission_cents bigint not null check (commission_cents >= 0),
  general_expenses_cents bigint not null check (general_expenses_cents >= 0),
  commercial_adjustment_cents bigint not null check (commercial_adjustment_cents >= 0),
  profit_cents bigint not null,
  fabiana_profit_cents bigint not null,
  fabian_profit_cents bigint not null,
  fabiana_capital_cents bigint check (fabiana_capital_cents >= 0),
  fabian_capital_cents bigint check (fabian_capital_cents >= 0),
  fabiana_expenses_paid_cents bigint not null check (fabiana_expenses_paid_cents >= 0),
  fabian_expenses_paid_cents bigint not null check (fabian_expenses_paid_cents >= 0),
  capital_evidence text not null check (capital_evidence in ('recorded', 'not_reported')),
  cash_settlement_status text not null check (cash_settlement_status = 'amount_not_documented'),
  primary key (business_id, operating_date),
  check (purchased_quantity = sold_quantity + gifted_quantity + consumed_quantity),
  check (profit_cents = sales_cents - purchase_cost_cents - commission_cents
         - general_expenses_cents - commercial_adjustment_cents),
  check (profit_cents = fabiana_profit_cents + fabian_profit_cents),
  check (general_expenses_cents = fabiana_expenses_paid_cents + fabian_expenses_paid_cents),
  check ((capital_evidence = 'recorded' and fabiana_capital_cents is not null and fabian_capital_cents is not null)
     or (capital_evidence = 'not_reported' and fabiana_capital_cents is null and fabian_capital_cents is null))
);
alter table public.legacy_daily_facts enable row level security;
revoke all on table public.legacy_daily_facts from anon, authenticated;
grant select on table public.legacy_daily_facts to authenticated;
create policy legacy_daily_facts_select_own on public.legacy_daily_facts
  for select to authenticated using (business_id = (select public.current_business_id()));

create table public.legacy_credit_attestations (
  business_id uuid not null,
  credit_row integer not null,
  status text not null check (status = 'reported_paid_assumed_date'),
  payment_date date not null check (payment_date = '2026-09-26'::date),
  amount_cents bigint not null check (amount_cents = 900),
  attested_at timestamptz not null default now(),
  primary key (business_id, credit_row)
);
alter table public.legacy_credit_attestations enable row level security;
revoke all on table public.legacy_credit_attestations from anon, authenticated;
grant select on table public.legacy_credit_attestations to authenticated;
create policy legacy_credit_attestations_select_own on public.legacy_credit_attestations
  for select to authenticated using (business_id = (select public.current_business_id()));

create function public.import_legacy_closures_once(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  business_uuid uuid;
  day_item jsonb;
  payment_item jsonb;
  source_item jsonb;
  historical_item jsonb;
  attestation_item jsonb;
  day_value date;
  previous_day date;
  payment_day date;
  closing_uuid uuid;
  credit_uuid uuid;
  credit_amount bigint;
  expected_days date[] := array['2026-09-03', '2026-09-04', '2026-09-08', '2026-09-09',
                                 '2026-09-11', '2026-09-17', '2026-09-18']::date[];
  day_count integer := 0;
  payment_count integer := 0;
  archive_count integer := 0;
  historical_count integer := 0;
  historical_previous_day date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  business_uuid := public.current_business_id();
  if business_uuid is null then raise exception 'No business assigned'; end if;
  if business_uuid <> '00000000-0000-4000-8000-000000000001'::uuid then
    raise exception 'This reviewed import is only for the seeded Rapipan business';
  end if;
  if p_payload is null or coalesce(jsonb_typeof(p_payload), '') <> 'object'
     or coalesce(p_payload->>'sourceSha256', '') <> '2b8a213a0eea13c68161717fd897fd21beb96abf0c63c90770e93886eea98cf1'
     or coalesce(jsonb_typeof(p_payload->'days'), '') <> 'array'
     or coalesce(jsonb_typeof(p_payload->'payments'), '') <> 'array'
     or coalesce(jsonb_typeof(p_payload->'archiveRows'), '') <> 'array'
     or coalesce(jsonb_typeof(p_payload->'legacyDays'), '') <> 'array'
     or coalesce(jsonb_typeof(p_payload->'creditAttestations'), '') <> 'array'
     or jsonb_array_length(p_payload->'days') <> 7
     or jsonb_array_length(p_payload->'payments') <> 2
     or jsonb_array_length(p_payload->'archiveRows') <> 68
     or jsonb_array_length(p_payload->'legacyDays') <> 24
     or jsonb_array_length(p_payload->'creditAttestations') <> 2 then
    raise exception 'The reviewed Excel import payload is invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(business_uuid::text, 0));
  if exists (select 1 from public.legacy_imports where business_id = business_uuid)
     or exists (select 1 from public.daily_closures where business_id = business_uuid) then
    raise exception 'Import is one-time and requires a business with no existing closures';
  end if;
  if not exists (select 1 from public.products where id = '00000000-0000-4000-8000-000000000021'::uuid and business_id = business_uuid and active)
     or not exists (select 1 from public.couriers where id = '00000000-0000-4000-8000-000000000031'::uuid and business_id = business_uuid and active)
     or (select count(*) from public.owners where business_id = business_uuid and active
       and id in ('00000000-0000-4000-8000-000000000011'::uuid, '00000000-0000-4000-8000-000000000012'::uuid)
       and profit_share_bps = 5000) <> 2 then
    raise exception 'Seeded catalog or owner shares differ from the reviewed workbook';
  end if;

  for day_item in select value from jsonb_array_elements(p_payload->'days') loop
    day_value := (day_item->>'operatingDate')::date;
    if day_value is null or day_value > (now() at time zone 'America/Lima')::date
       or (previous_day is not null and day_value <= previous_day) then
      raise exception 'Import days must be nonfuture, unique and strictly chronological';
    end if;
    if day_value <> expected_days[day_count + 1] then
      raise exception 'Import day differs from the reviewed preview';
    end if;
    closing_uuid := public.create_daily_closure(day_item);
    previous_day := day_value;
    day_count := day_count + 1;
  end loop;

  for payment_item in select value from jsonb_array_elements(p_payload->'payments') loop
    payment_day := (payment_item->>'paymentDate')::date;
    if not coalesce((
       (payment_item->>'saleDate' = '2026-09-08' and payment_day = '2026-09-18'::date
        and (payment_item->>'amountCents')::bigint = 450)
       or (payment_item->>'saleDate' = '2026-09-18' and payment_day = '2026-09-26'::date
        and (payment_item->>'amountCents')::bigint = 900)), false) then
      raise exception 'Payment differs from the reviewed collection dates';
    end if;
    select c.id, c.amount_cents into credit_uuid, credit_amount
      from public.credits c join public.daily_closures d on d.id = c.daily_closure_id
     where c.business_id = business_uuid and d.operating_date = (payment_item->>'saleDate')::date;
    if credit_uuid is null or credit_amount <> (payment_item->>'amountCents')::bigint then
      raise exception 'Payment does not match a single imported credit';
    end if;
    perform public.record_credit_payment(credit_uuid, payment_day);
    payment_count := payment_count + 1;
  end loop;

  for source_item in select value from jsonb_array_elements(p_payload->'archiveRows') loop
    if coalesce(source_item->>'sheet', '') not in
       ('Ventas_Diarias', 'Creditos_Clientes', 'Gastos_Generales', 'Sorteos_Domingos', 'Notas')
       or coalesce(jsonb_typeof(source_item->'cells'), '') <> 'object'
       or coalesce(jsonb_typeof(source_item->'calculatedColumns'), '') <> 'array'
       or coalesce(jsonb_typeof(source_item->'correction'), '') <> 'object' then
      raise exception 'Invalid archived source row';
    end if;
    insert into public.legacy_source_rows
      (business_id, sheet_name, source_row, record_date, cells, calculated_columns, correction)
    values (business_uuid, source_item->>'sheet', (source_item->>'row')::integer,
            (source_item->>'recordDate')::date, source_item->'cells', source_item->'calculatedColumns',
            source_item->'correction');
    archive_count := archive_count + 1;
  end loop;

  for historical_item in select value from jsonb_array_elements(p_payload->'legacyDays') loop
    day_value := (historical_item->>'operatingDate')::date;
    if day_value is null or day_value > (now() at time zone 'America/Lima')::date
       or (historical_previous_day is not null and day_value <= historical_previous_day) then
      raise exception 'Historical days must be nonfuture, unique and chronological';
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
    historical_previous_day := day_value;
    historical_count := historical_count + 1;
  end loop;

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

  insert into public.legacy_imports (business_id, source_sha256, imported_by, closed_days, historical_days, credit_payments, archived_rows)
    values (business_uuid, p_payload->>'sourceSha256', auth.uid(), day_count, historical_count, payment_count, archive_count);
  return jsonb_build_object('closedDays', day_count, 'creditPayments', payment_count,
                            'historicalDays', historical_count, 'archivedRows', archive_count,
                            'sourceSha256', p_payload->>'sourceSha256');
end;
$$;
revoke all on function public.import_legacy_closures_once(jsonb) from public, anon;
grant execute on function public.import_legacy_closures_once(jsonb) to authenticated;
