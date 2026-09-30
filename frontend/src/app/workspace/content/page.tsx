import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, House, Info } from "lucide-react";
import { WorkspacePageShell } from "@/components/workspace-page-shell";
import {
  WorkspaceCollection,
  WorkspaceRow,
} from "@/components/ui/workspace-surface";

export const metadata: Metadata = { title: "Site content" };

const PAGES = [
  {
    description:
      "Hero statement, research heading, calls to action, and recruitment band.",
    href: "/workspace/content/home",
    icon: House,
    title: "Home page",
  },
  {
    description:
      "Mission, research focus, organization facts, and closing invitation.",
    href: "/workspace/content/about",
    icon: Info,
    title: "About page",
  },
] as const;

export default function SiteContentPage() {
  return (
    <WorkspacePageShell description="Manage site contents shown in public views on home and about">
      <WorkspaceCollection>
        {PAGES.map(({ description, href, icon: Icon, title }) => (
          <WorkspaceRow key={href}>
            <Link
              className="group grid grid-cols-[38px_minmax(0,1fr)_20px] items-center gap-4 px-[1.4rem] py-4 transition-colors duration-180 hover:bg-brand-soft max-[560px]:grid-cols-[42px_minmax(0,1fr)_18px] max-[560px]:gap-[.65rem] max-[560px]:px-4"
              href={href}
            >
              <Icon
                aria-hidden="true"
                className="box-content border border-line bg-surface-subtle p-[.6rem] text-ink-muted"
                size={19}
              />
              <div className="min-w-0">
                <small className="font-mono text-[.58rem] uppercase tracking-[.08em] text-ink-faint">
                  Public page
                </small>
                <h3 className="mb-[.2rem] mt-[.18rem] text-[.92rem] font-semibold">
                  {title}
                </h3>
                <p className="m-0 text-[.76rem] leading-[1.45] text-ink-muted max-[560px]:hidden">
                  {description}
                </p>
              </div>
              <ArrowRight
                aria-hidden="true"
                className="text-ink-muted group-hover:text-brand"
                size={17}
              />
            </Link>
          </WorkspaceRow>
        ))}
      </WorkspaceCollection>
    </WorkspacePageShell>
  );
}
