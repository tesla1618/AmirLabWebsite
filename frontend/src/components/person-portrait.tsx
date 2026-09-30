import Image from "next/image";
import { API_URL } from "@/lib/api";
import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";
import type { Person } from "@/lib/types";

type PortraitPerson = Pick<Person, "avatar" | "fullName" | "slug">;

const variantClass = {
  directory: "aspect-square",
  department: "aspect-[6/7]",
  founder: "aspect-[4/4.6] max-h-[360px] max-[720px]:max-h-[210px]",
  profile:
    "aspect-[4/5] w-full max-[640px]:mx-auto max-[640px]:w-[min(78vw,300px)]",
} as const;

export function PersonPortrait({
  person,
  priority = false,
  variant = "directory",
  loading = false,
  className,
}: {
  person?: PortraitPerson;
  priority?: boolean;
  variant?: keyof typeof variantClass;
  loading?: boolean;
  className?: string;
}) {
  const initials = (person?.fullName ?? "AM")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative flex items-center justify-center overflow-hidden bg-surface-subtle font-sans text-[2rem] font-medium text-brand",
        variantClass[variant],
        loading && loadingPlaceholder(true, "portrait"),
        className,
      )}
      data-loading={loading || undefined}
      data-placeholder={loading ? "portrait" : undefined}
    >
      {!loading && person?.avatar ? (
        <Image
          alt=""
          fill
          fetchPriority={priority ? "high" : "auto"}
          loading={priority ? "eager" : "lazy"}
          className="object-cover object-top"
          sizes={
            variant === "profile"
              ? "(max-width: 760px) 100vw, 420px"
              : variant === "founder"
                ? "(max-width: 760px) 100vw, 390px"
                : "(max-width: 640px) 44vw, (max-width: 1100px) 30vw, 220px"
          }
          src={`${API_URL}/assets/${person.avatar.id}`}
        />
      ) : (
        <span>{loading ? "AM" : initials}</span>
      )}
    </div>
  );
}
