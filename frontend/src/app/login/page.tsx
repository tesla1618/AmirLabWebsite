import type { Metadata } from "next";
import { GuestOnly } from "@/components/guest-only";
import { LoginForm } from "@/components/login-form";
import { AuthPageFrame, AuthPageHeading } from "@/components/auth-page-frame";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <GuestOnly>
      <AuthPageFrame>
        <AuthPageHeading
          description="Sign in to the private member workspace."
          eyebrow="Member access"
          title="Lab workspace"
        />
        <LoginForm />
      </AuthPageFrame>
    </GuestOnly>
  );
}
