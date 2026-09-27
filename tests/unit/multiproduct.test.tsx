import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DailyCloseForm } from "../../src/components/daily-close/daily-close-form";
import { previewCatalog } from "../../src/lib/preview/catalog";

describe("product selector", () => {
  it("is hidden with one product and appears with two", () => {
    const single = renderToStaticMarkup(<DailyCloseForm catalog={previewCatalog} preview />);
    expect(single).not.toContain('aria-label="Producto"');
    const second = { id: "00000000-0000-4000-8000-000000000022", name: "Producto de prueba", default_cost_cents: 300, default_price_cents: 500 };
    const multi = renderToStaticMarkup(<DailyCloseForm catalog={{ ...previewCatalog, products: [...previewCatalog.products, second] }} preview />);
    expect(multi).toContain('aria-label="Producto"');
    expect(multi).toContain("Producto de prueba");
  });
});
