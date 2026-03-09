import { MonitoringDashboard } from "@/components/monitoring/MonitoringDashboard";
import { PageHeader } from "@/components/primitives/PageHeader";

export default function MonitoringRoute() {
  return (
    <section className="page-stack">
      <PageHeader
        title="Monitoring"
        subtitle="Track queue pressure, channel health, and system responsiveness in realtime."
      />
      <MonitoringDashboard />
    </section>
  );
}
