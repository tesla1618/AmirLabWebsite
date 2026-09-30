import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { AuthPageFrame, AuthPageHeading } from "@/components/auth-page-frame";

export const metadata: Metadata = { title: "Reset password" };

export default function ResetPasswordPage() {
  return (
    <AuthPageFrame>
      <AuthPageHeading
        description="The reset link is one-time use. A successful reset signs out existing sessions for this account."
        eyebrow="Account recovery"
        title="Choose a new password"
      />
      <ResetPasswordForm />
    </AuthPageFrame>
  );
}
