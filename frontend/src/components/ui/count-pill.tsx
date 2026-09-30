import { cn } from "@/lib/cn";

/** Outlined count used beside navigation rows (queue sizes, unread items). */
export function CountPill({
  className,
  count,
}: {
  className?: string;
  count: number;
}) {
  return (
    <strong
      className={cn(
        "inline-flex h-[1.1rem] min-w-[1.1rem] items-center justify-center rounded-[10px] border border-current bg-transparent px-[.25rem] font-mono text-[.52rem] font-bold",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </strong>
  );
}
