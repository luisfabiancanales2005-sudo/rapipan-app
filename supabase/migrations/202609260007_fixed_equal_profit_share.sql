-- Rapipan's two partners always split economic profit equally. A larger cash
-- advance changes capital reimbursement, never the profit percentage.
alter table public.owners add constraint owners_rapipan_equal_profit_share
  check (profit_share_bps = 5000);
