import type { Metadata } from "next";
import { RevertEmailForm } from "@/components/revert-email-form";
import { AuthPageFrame, AuthPageHeading } from "@/components/auth-page-frame";

export const metadata: Metadata = { title: "Revert email change" };

export default function RevertEmailPage() {
  return (
    <AuthPageFrame>
      <AuthPageHeading eyebrow="Account security" title="Revert email change" />
      <RevertEmailForm />
    </AuthPageFrame>
  );
}
