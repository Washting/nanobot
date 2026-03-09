import { LogsPanel } from "@/components/monitoring/LogsPanel";
import { PageHeader } from "@/components/primitives/PageHeader";

export default function LogsRoute() {
  return (
    <section className="page-stack">
      <PageHeader
        title="Logs"
        subtitle="Stream runtime logs with filters, pause mode, and controlled auto-scroll."
      />
      <LogsPanel />
    </section>
  );
}
