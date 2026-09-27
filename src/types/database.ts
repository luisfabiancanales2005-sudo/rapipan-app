/** Read types for the schema in supabase/migrations/202609250001_initial_schema.sql.
 * Regenerate from Supabase once a project is linked. Writes are not exposed yet.
 */
type Table<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

type Audited = { created_at: string; updated_at: string };
type Identified = { id: string; business_id: string };

export type Business = { id: string; name: string; timezone: string; currency_code: string } & Audited;
export type Profile = { id: string; business_id: string; display_name: string } & Audited;
export type BusinessSettings = {
  business_id: string;
  usual_cost_cents: number;
  usual_price_cents: number;
  usual_courier_commission_cents: number;
} & Audited;
export type Owner = Identified & {
  name: string; profit_share_bps: number; active: boolean; sort_order: number;
} & Audited;
export type Product = Identified & {
  name: string; active: boolean; default_cost_cents: number; default_price_cents: number;
} & Audited;
export type Courier = Identified & {
  name: string; active: boolean; default_commission_cents: number;
} & Audited;
export type DailyClosure = Identified & {
  operating_date: string;
  status: "draft" | "closed";
  opening_business_cash_cents: number;
  reserved_business_cash_cents: number;
  notes: string | null;
  shift_payload: Record<string, unknown> | null;
  closed_at: string | null;
} & Audited;
export type PurchaseLine = Identified & {
  daily_closure_id: string; product_id: string; quantity: number;
  unit_cost_cents: number; payer_type: "owner" | "business_cash" | "joint";
  owner_id: string | null; created_at: string;
};
export type SaleBatch = Identified & {
  daily_closure_id: string; product_id: string; quantity: number;
  unit_price_cents: number; created_at: string;
};
export type LeftoverLine = Identified & {
  daily_closure_id: string; product_id: string;
  gifted_quantity: number; consumed_quantity: number; notes: string | null; created_at: string;
};
export type CourierRun = Identified & {
  daily_closure_id: string; product_id: string; courier_id: string;
  delivered_quantity: number; commission_per_unit_cents: number;
  additional_commission_cents: number; created_at: string;
};
export type Expense = Identified & {
  daily_closure_id: string; concept: string; amount_cents: number;
  payer_type: "owner" | "business_cash"; owner_id: string | null; created_at: string;
};
export type Credit = Identified & {
  daily_closure_id: string; sale_batch_id: string | null; reference: string | null;
  amount_cents: number; status: "pending" | "paid";
} & Audited;
export type CreditPayment = Identified & {
  credit_id: string; payment_date: string; amount_cents: number; created_at: string;
};
export type Settlement = Identified & {
  daily_closure_id: string; owner_id: string; profit_share_bps: number;
  economic_profit_share_cents: number; capital_brought_forward_cents: number; capital_contributed_cents: number;
  capital_reimbursed_cents: number; capital_pending_cents: number;
  cash_profit_distributed_cents: number; total_cash_due_cents: number; created_at: string;
};
export type PurchaseCapitalContribution = { business_id: string; daily_closure_id: string; owner_id: string; amount_cents: number };
export type DailyShiftFact = { business_id: string; daily_closure_id: string; shift: "AM" | "PM";
  purchased_quantity: number; sold_quantity: number; gifted_quantity: number; consumed_quantity: number;
  sales_cents: number; purchase_cost_cents: number; commission_cents: number; expenses_cents: number; profit_cents: number };
export type LegacySourceRow = {
  business_id: string; sheet_name: string; source_row: number; record_date: string | null;
  cells: Record<string, string | number | boolean>; calculated_columns: string[];
  correction: Record<string, string | number | boolean>;
};
export type LegacyCreditAttestation = {
  business_id: string; credit_row: number; status: "reported_paid_assumed_date";
  payment_date: string; amount_cents: number; attested_at: string;
};
export type LegacyDailyFact = {
  business_id: string; operating_date: string; source_rows: number[];
  purchased_quantity: number; sold_quantity: number; gifted_quantity: number; consumed_quantity: number;
  sales_cents: number; purchase_cost_cents: number; commission_cents: number;
  general_expenses_cents: number; commercial_adjustment_cents: number; profit_cents: number;
  fabiana_profit_cents: number; fabian_profit_cents: number;
  fabiana_capital_cents: number | null; fabian_capital_cents: number | null;
  fabiana_expenses_paid_cents: number; fabian_expenses_paid_cents: number;
  capital_evidence: "recorded" | "not_reported";
  cash_settlement_status: "amount_not_documented";
};

export type Database = {
  public: {
    Tables: {
      businesses: Table<Business>;
      profiles: Table<Profile>;
      business_settings: Table<BusinessSettings>;
      owners: Table<Owner>;
      products: Table<Product>;
      couriers: Table<Courier>;
      daily_closures: Table<DailyClosure>;
      purchase_lines: Table<PurchaseLine>;
      sale_batches: Table<SaleBatch>;
      leftover_lines: Table<LeftoverLine>;
      courier_runs: Table<CourierRun>;
      expenses: Table<Expense>;
      credits: Table<Credit>;
      credit_payments: Table<CreditPayment>;
      settlements: Table<Settlement>;
      purchase_capital_contributions: Table<PurchaseCapitalContribution>;
      daily_shift_facts: Table<DailyShiftFact>;
      legacy_source_rows: Table<LegacySourceRow>;
      legacy_credit_attestations: Table<LegacyCreditAttestation>;
      legacy_daily_facts: Table<LegacyDailyFact>;
    };
    Views: Record<string, never>;
    Functions: {
      current_business_id: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      create_daily_closure: {
        Args: { p_payload: Record<string, unknown> };
        Returns: string;
      };
      create_daily_closure_v2: {
        Args: { p_payload: Record<string, unknown> };
        Returns: string;
      };
      update_daily_closure: {
        Args: { p_closure_id: string; p_expected_updated_at: string; p_payload: Record<string, unknown> };
        Returns: string;
      };
      update_daily_closure_v2: {
        Args: { p_closure_id: string; p_expected_updated_at: string; p_payload: Record<string, unknown> };
        Returns: string;
      };
      delete_daily_closure: {
        Args: { p_closure_id: string; p_expected_updated_at: string };
        Returns: string;
      };
      record_credit_payment: {
        Args: { p_credit_id: string; p_payment_date: string };
        Returns: string;
      };
      save_business_configuration: {
        Args: { p_expected_updated_at: string; p_payload: Record<string, unknown> };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
