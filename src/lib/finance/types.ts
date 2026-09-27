export type Payer = { type: "owner"; ownerId: string } | { type: "business_cash"; ownerId: null };
export type Shift = "AM" | "PM";

export type PurchaseInput = {
  productId: string;
  quantity: number;
  unitCostCents: number;
  shift: Shift;
};

export type SaleBatchInput = {
  productId: string;
  quantity: number;
  unitPriceCents: number;
  shift: Shift;
};

export type LeftoverInput = {
  productId: string;
  giftedQuantity: number;
  consumedQuantity: number;
  shift: Shift;
};

export type CourierRunInput = {
  productId: string;
  courierId: string;
  deliveredQuantity: number;
  commissionPerUnitCents: number;
  additionalCommissionCents: number;
  shift: Shift;
};

export type ExpenseInput = {
  concept: string;
  amountCents: number;
  payer: Payer;
  shift: Shift;
};

export type CapitalContributionInput = { ownerId: string; amountCents: number };

export type OwnerShareInput = {
  id: string;
  name: string;
  shareBps: number;
  priorCapitalCents: number;
  sortOrder: number;
};

export type ClosureInput = {
  operatingDate: string;
  purchases: PurchaseInput[];
  capitalContributions: CapitalContributionInput[];
  sales: SaleBatchInput[];
  leftovers: LeftoverInput[];
  courierRuns: CourierRunInput[];
  expenses: ExpenseInput[];
  credit: { amountCents: number; reference: string } | null;
  creditCollectionsCents?: number;
  owners: OwnerShareInput[];
  openingBusinessCashCents: number;
  reservedBusinessCashCents: number;
  notes: string;
};

export type OwnerSettlement = {
  ownerId: string;
  ownerName: string;
  shareBps: number;
  economicProfitShareCents: number;
  priorCapitalCents: number;
  capitalContributedCents: number;
  capitalReimbursedCents: number;
  capitalPendingCents: number;
  cashProfitDistributedCents: number;
  totalCashDueCents: number;
};
