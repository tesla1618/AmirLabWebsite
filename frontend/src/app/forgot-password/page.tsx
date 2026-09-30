import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { AuthPageFrame, AuthPageHeading } from "@/components/auth-page-frame";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <AuthPageFrame>
      <AuthPageHeading
        description="Enter the email used to sign in. If the account is active, we will send a one-time reset link."
        eyebrow="Account recovery"
        title="Reset your password"
      />
      <ForgotPasswordForm />
    </AuthPageFrame>
  );
}
