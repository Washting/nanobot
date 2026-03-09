import { SessionViewer } from "@/components/sessions/SessionViewer";
import { PageHeader } from "@/components/primitives/PageHeader";

export default function SessionsRoute() {
  return (
    <section className="page-stack">
      <PageHeader
        title="Sessions"
        subtitle="Search and inspect persisted sessions with quick preview and guarded deletion."
      />
      <SessionViewer />
    </section>
  );
}
