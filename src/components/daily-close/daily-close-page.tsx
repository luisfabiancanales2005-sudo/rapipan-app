"use client";

import { useEffect, useState } from "react";
import { AlertCircle, LoaderCircle } from "lucide-react";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { getBusinessContext, getBusinessDefaults } from "@/lib/supabase/queries/business";
import { listActiveCouriers, listActiveProducts, listOwners } from "@/lib/supabase/queries/catalog";
import { getLatestCapitalByOwner } from "@/lib/supabase/queries/closures";
import { DailyCloseForm, type DailyCloseCatalog } from "./daily-close-form";

export function DailyClosePage() {
  const [catalog, setCatalog] = useState<DailyCloseCatalog | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const user = await getAuthenticatedUser();
        if (!user) throw new Error("Inicia sesión para registrar el día.");
        const { business } = await getBusinessContext(user.id);
        const [products, couriers, owners, defaults, capital] = await Promise.all([
          listActiveProducts(business.id), listActiveCouriers(business.id),
          listOwners(business.id), getBusinessDefaults(business.id),
          getLatestCapitalByOwner(business.id),
        ]);
        if (active) setCatalog({
          businessId: business.id, products, couriers, defaults,
          owners: owners.map((owner) => ({
            id: owner.id, name: owner.name, shareBps: owner.profit_share_bps,
            sortOrder: owner.sort_order, priorCapitalCents: capital.get(owner.id) ?? 0,
          })),
        });
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "No se pudieron cargar los datos del negocio.");
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  if (error) return <div className="card flex items-start gap-3 p-6 text-sm text-red-700" role="alert"><AlertCircle size={20} />{error}</div>;
  if (!catalog) return <div className="flex items-center gap-3 text-sm text-[var(--muted)]" role="status"><LoaderCircle size={20} className="animate-spin" /> Cargando configuración…</div>;
  if (catalog.products.length === 0 || catalog.owners.length !== 2) {
    return <div className="card p-6 text-sm text-[var(--muted)]" role="alert">Se necesitan al menos un producto activo y dos socios activos para registrar un cierre.</div>;
  }
  return <DailyCloseForm catalog={catalog} businessId={catalog.businessId} />;
}
