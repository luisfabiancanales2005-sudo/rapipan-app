"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Configuration } from "@/lib/supabase/queries/configuration";
import type { ConfigurationPayload } from "@/lib/validation/configuration";
import { validatePreviewConfiguration } from "@/lib/validation/configuration";
import { previewCatalog } from "@/lib/preview/catalog";

const key = "rapipan-commercial-demo-settings-v1";
const businessId = "00000000-0000-4000-8000-000000000001";

function configurationFromPayload(payload: ConfigurationPayload): Configuration {
  return {
    business: { id: businessId, name: payload.name, updated_at: new Date().toISOString() },
    defaults: {
      usual_cost_cents: payload.usualCostCents,
      usual_price_cents: payload.usualPriceCents,
      usual_courier_commission_cents: payload.usualCourierCommissionCents,
    },
    owners: payload.owners.map((owner, index) => ({
      id: owner.id, name: owner.name, profit_share_bps: owner.shareBps, active: true, sort_order: index + 1,
    })),
    products: payload.products.map((product) => ({
      id: product.id ?? crypto.randomUUID(), name: product.name, active: product.active,
      default_cost_cents: product.defaultCostCents, default_price_cents: product.defaultPriceCents,
    })),
    couriers: payload.couriers.map((courier) => ({
      id: courier.id ?? crypto.randomUUID(), name: courier.name, active: courier.active,
      default_commission_cents: courier.defaultCommissionCents,
    })),
  };
}

const defaultConfiguration: Configuration = {
  business: { id: businessId, name: "Demo de ventas", updated_at: "2026-09-25T12:00:00Z" },
  defaults: previewCatalog.defaults,
  owners: previewCatalog.owners.map((owner) => ({ id: owner.id, name: owner.name, profit_share_bps: owner.shareBps, active: true, sort_order: owner.sortOrder })),
  products: previewCatalog.products.map((product) => ({ id: product.id, name: product.name, active: true, default_cost_cents: product.default_cost_cents, default_price_cents: product.default_price_cents })),
  couriers: previewCatalog.couriers.map((courier) => ({ id: courier.id, name: courier.name, active: true, default_commission_cents: courier.default_commission_cents })),
};

type DemoContext = {
  configuration: Configuration;
  save: (payload: ConfigurationPayload) => Promise<void>;
};

const context = createContext<DemoContext | null>(null);

export function DemoSettingsProvider({ children }: { children: ReactNode }) {
  const [configuration, setConfiguration] = useState<Configuration>(defaultConfiguration);

  useEffect(() => {
    let active = true;
    try {
      const stored = window.sessionStorage.getItem(key);
      if (!stored) return;
      const payload = JSON.parse(stored) as ConfigurationPayload;
      if (validatePreviewConfiguration(payload).length === 0) {
        queueMicrotask(() => { if (active) setConfiguration(configurationFromPayload(payload)); });
      }
    } catch { /* Ignore invalid local demo settings. */ }
    return () => { active = false; };
  }, []);

  async function save(payload: ConfigurationPayload) {
    const issues = validatePreviewConfiguration(payload);
    if (issues.length > 0) throw new Error(issues.join(" "));
    const next = configurationFromPayload(payload);
    window.sessionStorage.setItem(key, JSON.stringify({
      ...payload,
      products: next.products.map((product) => ({ id: product.id, name: product.name, active: product.active, defaultCostCents: product.default_cost_cents, defaultPriceCents: product.default_price_cents })),
      couriers: next.couriers.map((courier) => ({ id: courier.id, name: courier.name, active: courier.active, defaultCommissionCents: courier.default_commission_cents })),
    } satisfies ConfigurationPayload));
    setConfiguration(next);
  }

  return <context.Provider value={{ configuration, save }}>{children}</context.Provider>;
}

export function useDemoSettings() {
  const value = useContext(context);
  if (!value) throw new Error("Demo settings are unavailable outside the preview layout.");
  return value;
}
