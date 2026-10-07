"use client";

import { ConfigurationView } from "@/components/configuration/configuration-page";
import { MobileNav, Sidebar } from "@/components/layout/navigation";
import { useDemoSettings } from "@/components/preview/demo-settings";

export default function ConfigurationPreviewPage() {
  const { configuration, save } = useDemoSettings();
  return <div className="page-shell"><Sidebar /><main className="main-content"><ConfigurationView key={configuration.business.updated_at} config={configuration} preview onSave={save} /></main><MobileNav /></div>;
}
