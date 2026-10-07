import Image from "next/image";
import { API_URL } from "@/lib/api-url";
import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";

const sizeClass = {
  xs: "h-5 w-5 text-[.5rem]",
  sm: "h-8 w-8 text-[.62rem]",
  md: "h-[38px] w-[38px] text-[.7rem]",
  lg: "h-11 w-11 text-[.76rem]",
} as const;

export function ProfileAvatar({
  avatarId,
  className,
  loading = false,
  name,
  shape = "control",
  size = "md",
  src,
}: {
  avatarId?: string | null;
  className?: string;
  loading?: boolean;
  name?: string | null;
  shape?: "control" | "round";
  size?: keyof typeof sizeClass;
  src?: string | null;
}) {
  const initial = (name?.trim().charAt(0) || "A").toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden border border-line-strong bg-brand-faint font-mono font-semibold text-brand",
        shape === "round" ? "rounded-full" : "rounded-control",
        sizeClass[size],
        loading && loadingPlaceholder(true, "portrait"),
        className,
      )}
      data-profile-avatar="true"
      data-placeholder={loading ? "portrait" : undefined}
    >
      {!loading && (src || avatarId) ? (
        <Image
          alt=""
          fill
          sizes={
            size === "lg"
              ? "44px"
              : size === "md"
                ? "38px"
                : size === "sm"
                  ? "32px"
                  : "20px"
          }
          className="object-cover"
          src={src || `${API_URL}/assets/${avatarId}`}
        />
      ) : (
        <span>{initial}</span>
      )}
    </span>
  );
}
