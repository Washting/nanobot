import { ChatInterface } from "@/components/chat/ChatInterface";
import { PageHeader } from "@/components/primitives/PageHeader";

export default function ChatRoute() {
  return (
    <section className="page-stack">
      <PageHeader
        title="Chat"
        subtitle="Bidirectional realtime conversation with optimistic UX and resilient reconnect handling."
      />
      <ChatInterface />
    </section>
  );
}
