import { connection } from "next/server";
import { PwaProvider } from "@/components/pwa-provider";
import type { Metadata } from "next";
import { AuthProvider } from "@/components/auth-provider";
import { FormValidation } from "@/components/form-validation";
import { NotificationProvider } from "@/components/notification-provider";
import { SiteLayout } from "@/components/site-layout";
import { NavigationProgress } from "@/components/ui/navigation-progress";
import "./globals.css";

export const metadata: Metadata = {
  icons: {
    icon: [{ type: "image/webp", url: "/amirlab-logo.webp" }],
    shortcut: "/amirlab-logo.webp",
    apple: "/apple-touch-icon.png",
  },
  title: {
    default: "AmirLab",
    template: "%s · AmirLab",
  },
  description:
    "Advanced Machine Intelligence Research Lab people, publications, datasets, projects, and opportunities.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Public data is cached separately. Request rendering avoids persisting
  // outage fallbacks or resurrecting previously invalidated HTML after restart.
  await connection();

  return (
    <html data-scroll-behavior="smooth" lang="en">
      <body>
        <NavigationProgress />
        <a
          className="fixed left-4 top-[-5rem] z-[200] bg-ink px-4 py-3 text-white focus:top-4"
          href="#content"
        >
          Skip to content
        </a>
        <PwaProvider>
          <AuthProvider>
            <NotificationProvider>
              <FormValidation />
              <SiteLayout>{children}</SiteLayout>
            </NotificationProvider>
          </AuthProvider>
        </PwaProvider>
      </body>
    </html>
  );
}
