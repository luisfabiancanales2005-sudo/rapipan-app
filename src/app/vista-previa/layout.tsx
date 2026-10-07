import type { ReactNode } from "react";
import type { Metadata } from "next";
import { DemoSettingsProvider } from "@/components/preview/demo-settings";

export const metadata: Metadata = {
  title: "Demo de ventas",
  description: "Demostración con productos y datos ficticios",
};

export default function PreviewLayout({ children }: { children: ReactNode }) {
  return <DemoSettingsProvider>{children}</DemoSettingsProvider>;
}
