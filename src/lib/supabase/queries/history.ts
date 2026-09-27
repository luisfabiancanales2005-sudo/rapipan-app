import { getSupabaseClient } from "../client";
import { collectionsForClose } from "../../finance/credit-flow";
import { collectPages, getFactsForClosures } from "./dashboard";

const PAGE_SIZE = 20;

export async function getHistoryPage(businessId: string, page: number) {
  const from = Math.max(0, page) * PAGE_SIZE;
  const { data, error } = await getSupabaseClient().from("daily_closures")
    .select("id, operating_date, updated_at")
    .eq("business_id", businessId).eq("status", "closed")
    .order("operating_date", { ascending: false })
    .range(from, from + PAGE_SIZE);
  if (error) throw error;
  const closures = (data ?? []).slice(0, PAGE_SIZE);
  const facts = await getFactsForClosures(businessId, closures);
  const updates = new Map(closures.map((row) => [row.id, row.updated_at]));
  return {
    items: facts.map((fact) => ({ ...fact, updatedAt: updates.get(fact.id) ?? "" })).sort((a, b) => b.date.localeCompare(a.date)),
    hasMore: (data ?? []).length > PAGE_SIZE,
  };
}

export async function getUnallocatedCollections(businessId: string, closingDate: string) {
  const client = getSupabaseClient();
  const { data: prior, error: priorError } = await client.from("daily_closures")
    .select("operating_date").eq("business_id", businessId).eq("status", "closed")
    .lt("operating_date", closingDate).order("operating_date", { ascending: false })
    .limit(1).maybeSingle();
  if (priorError) throw priorError;
  const payments = await collectPages((from, to) => {
    let query = client.from("credit_payments").select("id, payment_date, amount_cents")
      .eq("business_id", businessId).lte("payment_date", closingDate)
      .order("id").range(from, to);
    if (prior) query = query.gt("payment_date", prior.operating_date);
    return query;
  });
  return collectionsForClose(payments.map((payment) => ({ paymentDate: payment.payment_date, amountCents: payment.amount_cents })), prior?.operating_date ?? null, closingDate);
}

export async function getClosureDetail(businessId: string, closureId: string) {
  const client = getSupabaseClient();
  const { data: closure, error: closureError } = await client.from("daily_closures")
    .select("*").eq("business_id", businessId).eq("id", closureId).eq("status", "closed")
    .maybeSingle();
  if (closureError) throw closureError;
  if (!closure) return null;
  const [purchases, sales, leftovers, couriers, expenses, credits, settlements, products, owners, courierNames, collections] = await Promise.all([
    collectPages((from, to) => client.from("purchase_lines").select("*").eq("business_id", businessId).eq("daily_closure_id", closureId).order("created_at").order("id").range(from, to)),
    collectPages((from, to) => client.from("sale_batches").select("*").eq("business_id", businessId).eq("daily_closure_id", closureId).order("created_at").order("id").range(from, to)),
    collectPages((from, to) => client.from("leftover_lines").select("*").eq("business_id", businessId).eq("daily_closure_id", closureId).order("created_at").order("id").range(from, to)),
    collectPages((from, to) => client.from("courier_runs").select("*").eq("business_id", businessId).eq("daily_closure_id", closureId).order("created_at").order("id").range(from, to)),
    collectPages((from, to) => client.from("expenses").select("*").eq("business_id", businessId).eq("daily_closure_id", closureId).order("created_at").order("id").range(from, to)),
    collectPages((from, to) => client.from("credits").select("*").eq("business_id", businessId).eq("daily_closure_id", closureId).order("created_at").order("id").range(from, to)),
    collectPages((from, to) => client.from("settlements").select("*").eq("business_id", businessId).eq("daily_closure_id", closureId).order("id").range(from, to)),
    collectPages((from, to) => client.from("products").select("id, name, default_cost_cents, default_price_cents").eq("business_id", businessId).order("id").range(from, to)),
    collectPages((from, to) => client.from("owners").select("id, name, profit_share_bps, sort_order").eq("business_id", businessId).order("id").range(from, to)),
    collectPages((from, to) => client.from("couriers").select("id, name, default_commission_cents").eq("business_id", businessId).order("id").range(from, to)),
    getUnallocatedCollections(businessId, closure.operating_date),
  ]);
  const creditIds = credits.map((credit) => credit.id);
  const payments = creditIds.length > 0
    ? await collectPages((from, to) => client.from("credit_payments").select("*")
      .eq("business_id", businessId).in("credit_id", creditIds).order("id").range(from, to))
    : [];
  return {
    closure, purchases, sales, leftovers, couriers,
    expenses, credits, settlements, products,
    owners, courierNames,
    collectionsCents: collections, payments,
  };
}

export type ClosureDetail = NonNullable<Awaited<ReturnType<typeof getClosureDetail>>>;
