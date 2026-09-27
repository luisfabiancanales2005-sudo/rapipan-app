-- Seed for local development. No login-capable user is created here.
-- Create the private Auth user in Supabase, then attach it to this business
-- using the provisioning query in README.md.

begin;

insert into public.businesses (id, name, timezone, currency_code)
values ('00000000-0000-4000-8000-000000000001', 'Rapipan', 'America/Lima', 'PEN')
on conflict (id) do nothing;

insert into public.business_settings (
  business_id, usual_cost_cents, usual_price_cents, usual_courier_commission_cents
) values (
  '00000000-0000-4000-8000-000000000001', 250, 450, 100
) on conflict (business_id) do nothing;

insert into public.owners (id, business_id, name, profit_share_bps, active, sort_order)
values
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001', 'Fabiana', 5000, true, 1),
  ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000001', 'Fabián', 5000, true, 2)
on conflict (id) do nothing;

insert into public.products (
  id, business_id, name, active, default_cost_cents, default_price_cents
) values (
  '00000000-0000-4000-8000-000000000021',
  '00000000-0000-4000-8000-000000000001',
  'Pan Rapipan', true, 250, 450
) on conflict (id) do nothing;

insert into public.couriers (
  id, business_id, name, active, default_commission_cents
) values (
  '00000000-0000-4000-8000-000000000031',
  '00000000-0000-4000-8000-000000000001',
  'Repartidor principal', true, 100
) on conflict (id) do nothing;

commit;
