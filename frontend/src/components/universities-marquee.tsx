"use client";

import Image from "next/image";
import { publicShellWidthClass } from "@/components/ui/public-shell";
import { API_URL } from "@/lib/api";
import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";
import type { University } from "@/lib/types";

const MINOR_WORDS = new Set(["and", "at", "for", "of", "the"]);

function monogram(name: string) {
  return name
    .split(/\s+/)
    .filter((word) => word && !MINOR_WORDS.has(word.toLowerCase()))
    .slice(0, 3)
    .map((word) => word[0].toUpperCase())
    .join("");
}

function UniversityChip({
  hidden,
  university,
}: {
  hidden: boolean;
  /** Undefined while loading: same chip box with placeholder content. */
  university?: University;
}) {
  const loading = !university;
  const content = (
    <>
      <span className="grid aspect-square h-full shrink-0 place-items-center border-r border-line bg-canvas font-mono text-[.6rem] font-semibold tracking-[.06em] text-brand">
        {university?.logoAssetId ? (
          <Image
            alt=""
            className="size-6 object-contain grayscale transition-[filter] duration-300 group-hover:grayscale-0"
            height={24}
            src={`${API_URL}/assets/${university.logoAssetId}`}
            unoptimized
            width={24}
          />
        ) : (
          <span
            className={loadingPlaceholder(loading, "text")}
            data-placeholder={loading ? "text" : undefined}
          >
            {university ? monogram(university.name) : "UNI"}
          </span>
        )}
      </span>
      <span className="px-3 font-mono text-[.66rem] whitespace-nowrap text-ink-muted transition-colors group-hover:text-ink">
        <span
          className={loadingPlaceholder(loading, "text")}
          data-placeholder={loading ? "text" : undefined}
        >
          {university?.name ?? "Partner university name"}
        </span>
      </span>
    </>
  );
  const chip =
    "group mx-1.5 flex h-9 shrink-0 items-center border border-line bg-surface text-inherit no-underline";
  return university?.websiteUrl ? (
    <a
      aria-hidden={hidden || undefined}
      className={chip}
      href={university.websiteUrl}
      rel="noopener noreferrer"
      tabIndex={hidden ? -1 : undefined}
      target="_blank"
    >
      {content}
    </a>
  ) : (
    <span aria-hidden={hidden || loading || undefined} className={chip}>
      {content}
    </span>
  );
}

const CHIP_WIDTH = 260;
const MIN_TRACK_PX = 4000;
const LOADING_CHIPS = 8;

/**
 * One rail-to-rail band of university chips scrolling sideways. The track is
 * two identical halves so the -50% keyframe loops seamlessly. While loading
 * it renders the same band with placeholder chips and does not move.
 */
export function UniversitiesMarquee({
  direction = "left",
  loading = false,
  universities,
}: {
  direction?: "left" | "right";
  loading?: boolean;
  universities: University[];
}) {
  if (!loading && !universities.length) return null;

  const items: Array<University | undefined> = loading
    ? Array.from({ length: LOADING_CHIPS }, () => undefined)
    : Array.from(
        {
          length:
            2 *
            Math.ceil(MIN_TRACK_PX / 2 / (universities.length * CHIP_WIDTH)),
        },
        () => universities,
      ).flat();
  // A reversed band repeats the first band's content for sighted users only.
  const duplicate = direction === "right";

  return (
    <div
      aria-hidden={duplicate || undefined}
      className={cn(
        publicShellWidthClass,
        "group/marquee overflow-hidden border-y border-line [mask-image:linear-gradient(to_right,transparent,#000_6%,#000_94%,transparent)]",
      )}
      data-loading={loading || undefined}
    >
      <div
        className={cn(
          "flex w-max py-2",
          !loading &&
            "will-change-transform animate-[marquee-scroll_90s_linear_infinite] group-hover/marquee:[animation-play-state:paused] motion-reduce:animate-none",
          !loading && duplicate && "[animation-direction:reverse]",
          loading && duplicate && "-translate-x-1/4",
        )}
      >
        {items.map((university, index) => (
          <UniversityChip
            hidden={duplicate || index >= universities.length}
            key={university ? `${university.id}-${index}` : `loading-${index}`}
            university={university}
          />
        ))}
      </div>
    </div>
  );
}
