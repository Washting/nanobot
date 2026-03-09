import { ConfigEditor } from "@/components/config/ConfigEditor";
import { PageHeader } from "@/components/primitives/PageHeader";

export default function ConfigRoute() {
  return (
    <section className="page-stack">
      <PageHeader
        title="Configuration"
        subtitle="Safely edit channels JSON with validation, diff summary, and restart requirement hints."
      />
      <ConfigEditor />
    </section>
  );
}
