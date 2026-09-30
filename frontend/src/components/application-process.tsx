import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";

const STEPS = [
  {
    meta: "Choose an open role and upload one text-based PDF.",
    title: "Upload CV",
  },
  {
    meta: "We check readable text, contact details, and section structure.",
    title: "ATS validation",
  },
  {
    meta: "A lab reviewer checks the parsed CV beside the original file.",
    title: "Human review",
  },
  {
    meta: "Accepted applicants receive secure instructions to activate an account.",
    title: "Decision & account",
  },
] as const;

export function ApplicationProcess({ loading = false }: { loading?: boolean }) {
  return (
    <aside
      className="sticky top-[6.5rem] self-start px-[.25rem] py-[.25rem] max-[900px]:static"
      aria-label="Application process"
    >
      <p
        className={cn(
          "m-0 mb-4 font-[var(--font-sans)] text-[.75rem] font-extrabold uppercase tracking-[.12em] text-brand",
          loading && loadingPlaceholder(true, "label", "medium"),
        )}
      >
        Application path
      </p>
      <h2
        className={cn(
          "mb-[1.8rem] mt-3 font-sans text-[clamp(2rem,3vw,2.8rem)] font-medium leading-[.98] tracking-[-.035em]",
          loading && loadingPlaceholder(true, "text", "long"),
        )}
      >
        From upload to review
      </h2>
      <ol className="relative m-0 list-none p-0">
        {STEPS.map((step, index) => (
          <li
            className="relative z-[1] grid grid-cols-[27px_minmax(0,1fr)] gap-1 pb-6 after:absolute after:top-[27px] after:bottom-0 after:left-[13px] after:w-px after:bg-line last:pb-0 last:after:hidden"
            key={step.title}
          >
            <span
              aria-hidden="true"
              className="row-span-2 grid h-[27px] w-[27px] place-items-center border border-line-strong bg-canvas font-mono text-[.55rem] text-ink-muted"
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <strong
              className={cn(
                "pl-[.7rem] text-[.88rem] leading-[1.3]",
                loading && loadingPlaceholder(true, "text", "medium"),
              )}
            >
              {step.title}
            </strong>
            <p
              className={cn(
                "m-0 ml-[.7rem] pl-0 text-[.76rem] leading-[1.45] text-ink-muted",
                loading && loadingPlaceholder(true, "text", "long"),
              )}
            >
              {step.meta}
            </p>
          </li>
        ))}
      </ol>
    </aside>
  );
}
