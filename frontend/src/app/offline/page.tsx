import { ButtonLink } from "@/components/ui/button-control";
export default function OfflinePage() {
  return (
    <main className="mx-auto grid max-w-lg gap-4 px-6 py-24">
      <h1 className="font-serif text-3xl">You&apos;re offline</h1>
      <p className="text-ink-muted">
        Reconnect to view your workspace and account.
      </p>
      <ButtonLink href="/workspace" variant="primary">
        Try again
      </ButtonLink>
    </main>
  );
}
