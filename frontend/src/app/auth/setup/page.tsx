import type { Metadata } from "next";
import { AccountSetupForm } from "@/components/account-setup-form";
import { GuestOnly } from "@/components/guest-only";
import { AuthPageFrame, AuthPageHeading } from "@/components/auth-page-frame";

export const metadata: Metadata = { title: "Set up account" };

export default async function AccountSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <GuestOnly>
      <AuthPageFrame>
        <AuthPageHeading
          description="This one-time link activates your account. Future logins use your email and password."
          eyebrow="First-time access"
          title="Create your password"
        />
        <AccountSetupForm token={token} />
      </AuthPageFrame>
    </GuestOnly>
  );
}
