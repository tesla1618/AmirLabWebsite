import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The public content box. Its edges are the inner frame rails at every width
 * (see --frame-inner), so content, rules, and rails always meet exactly.
 */
export const publicShellWidthClass =
  "mx-auto w-full max-w-[min(var(--public-wide),calc(100%_-_2*var(--frame-mobile-inner)))]";

/** The content box plus its gutter. `cn` does not merge conflicting
 * utilities, so rail-to-rail content uses publicShellWidthClass instead of
 * overriding this padding. */
export const publicShellClass = `${publicShellWidthClass} px-[var(--public-gutter)]`;

export function PublicShell({
  as: Component = "div",
  className,
  children,
  ...props
}: { as?: ElementType; className?: string; children: ReactNode } & Omit<
  ComponentPropsWithoutRef<"div">,
  "children"
>) {
  return (
    <Component className={cn(publicShellClass, className)} {...props}>
      {children}
    </Component>
  );
}

export type FramePatternVariant =
  "grid" | "plus" | "dot" | "diagonal" | "cross";

const patternClass: Record<FramePatternVariant, string> = {
  grid: "frame-grid-hatch",
  plus: "frame-plus-hatch",
  dot: "frame-dot-hatch",
  diagonal: "frame-diagonal-hatch",
  cross: "frame-cross-hatch",
};

type FrameStroke = "solid" | "dashed" | "dotted" | "mixed";

const strokeClass: Record<FrameStroke, string> = {
  solid: "frame-stroke-solid-x",
  dashed: "frame-stroke-dashed-x",
  dotted: "frame-stroke-dotted-x",
  mixed: "frame-stroke-mixed-x",
};

type NodeSurface = "canvas" | "surface";

const nodeSurfaceClass: Record<NodeSurface, string> = {
  canvas: "[--frame-node-surface:var(--canvas)]",
  surface: "[--frame-node-surface:var(--surface)]",
};

type FrameBoundary = "none" | "top" | "bottom" | "both";

/**
 * The shared outer frame for a public page section. Boundaries are drawn by
 * FrameRule and the side bays by FrameBays, so pages never draw frame lines.
 */
export function PublicSection({
  as: Component = "section",
  bay,
  boundary = "none",
  children,
  className,
  contentClassName,
  nodeSurface = "canvas",
  ...props
}: {
  as?: "div" | "header" | "section";
  bay?: FramePatternVariant;
  boundary?: FrameBoundary;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  nodeSurface?: NodeSurface;
} & Omit<ComponentPropsWithoutRef<"section">, "children" | "className">) {
  return (
    <Component className={cn("relative", className)} {...props}>
      {bay ? <FrameBays pattern={bay} /> : null}
      {boundary === "top" || boundary === "both" ? (
        <FrameRule edge="top" nodeSurface={nodeSurface} />
      ) : null}
      <PublicShell className={cn("relative", contentClassName)}>
        {children}
      </PublicShell>
      {boundary === "bottom" || boundary === "both" ? (
        <FrameRule edge="bottom" nodeSurface={nodeSurface} />
      ) : null}
    </Component>
  );
}

/** Extends a child collection from the padded content box to both rails. */
export function FramedCollection({
  children,
  className,
  topRule = false,
}: {
  children: ReactNode;
  className?: string;
  topRule?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative -mx-[var(--public-gutter)]",
        topRule && "border-t border-line-strong",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A connected row inside a FramedCollection. */
export function FramedRow({
  as: Component = "div",
  bleed = false,
  children,
  className,
  rule = true,
  ...props
}: {
  as?: "article" | "div" | "header";
  bleed?: boolean;
  children: ReactNode;
  className?: string;
  rule?: boolean;
} & Omit<ComponentPropsWithoutRef<"article">, "children" | "className">) {
  return (
    <Component
      className={cn(
        "relative",
        rule && "border-b border-line-strong",
        bleed && "-mx-[var(--public-gutter)]",
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}

/**
 * Page-level rails at the content box edges. `page` (public site): dashed
 * outer pair plus solid inner pair. `quiet` (workspace): faint dashed inner
 * pair only. Render once per full-width frame region.
 */
export function FrameRails({
  className,
  tone = "page",
}: {
  className?: string;
  tone?: "page" | "quiet";
}) {
  const inner =
    tone === "page" ? "frame-stroke-solid-y" : "frame-stroke-dashed-y";
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 z-[5]",
        tone === "quiet" && "[--frame-line:var(--line)]",
        className,
      )}
    >
      {tone === "page" ? (
        <>
          <span className="frame-stroke-dashed-y absolute inset-y-0 left-[var(--frame-outer)] w-px" />
          <span className="frame-stroke-dashed-y absolute inset-y-0 right-[var(--frame-outer)] w-px" />
        </>
      ) : null}
      <span
        className={cn(
          inner,
          "absolute inset-y-0 left-[var(--frame-inner)] w-px",
        )}
      />
      <span
        className={cn(
          inner,
          "absolute inset-y-0 right-[var(--frame-inner)] w-px",
        )}
      />
    </div>
  );
}

/** Fills both side bays (outer rail to inner rail) for the parent's height. */
export function FrameBays({
  className,
  pattern,
}: {
  className?: string;
  pattern: FramePatternVariant;
}) {
  const bay = cn(
    "absolute inset-y-0 w-[calc(var(--frame-inner)_-_var(--frame-outer))]",
    patternClass[pattern],
  );
  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0", className)}
    >
      <span className={cn(bay, "left-[var(--frame-outer)]")} />
      <span className={cn(bay, "right-[var(--frame-outer)]")} />
    </div>
  );
}

export function FramePattern({
  className,
  variant = "grid",
}: {
  className?: string;
  variant?: FramePatternVariant;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none block",
        patternClass[variant],
        className,
      )}
    />
  );
}

function FrameNode({ className }: { className: string }) {
  return <span className={cn("frame-node absolute", className)} />;
}

/**
 * A full-width section rule with square nodes where it crosses the inner
 * rails. `viewport` bleeds from inside the content box to the page edges;
 * `parent` spans its (already full-width) positioned parent.
 */
export function FrameRule({
  className,
  edge = "bottom",
  nodes = true,
  nodeSurface = "canvas",
  scope = "viewport",
  stroke = "solid",
}: {
  className?: string;
  edge?: "top" | "bottom";
  nodes?: boolean;
  nodeSurface?: NodeSurface;
  scope?: "viewport" | "parent";
  stroke?: FrameStroke;
}) {
  const y =
    edge === "top"
      ? "top-[var(--frame-node-offset)]"
      : "bottom-[var(--frame-node-offset)]";
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute z-30 h-0",
        edge === "top" ? "top-0" : "bottom-0",
        scope === "viewport"
          ? "right-[calc((100%_-_100cqw)/2)] left-[calc((100%_-_100cqw)/2)]"
          : "inset-x-0",
        nodeSurfaceClass[nodeSurface],
        className,
      )}
    >
      <span
        className={cn(
          strokeClass[stroke],
          "absolute inset-x-0 h-px",
          edge === "top" ? "top-0" : "bottom-0",
        )}
      />
      {nodes ? (
        <>
          <FrameNode
            className={cn(
              y,
              "left-[calc(var(--frame-inner)_+_var(--frame-node-offset))]",
            )}
          />
          <FrameNode
            className={cn(
              y,
              "right-[calc(var(--frame-inner)_+_var(--frame-node-offset))]",
            )}
          />
        </>
      ) : null}
    </div>
  );
}

export function Eyebrow({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"p"> & {
  children: ReactNode;
}) {
  return (
    <p
      className={cn(
        "mb-[.65rem] font-mono text-[.66rem] font-semibold tracking-[.105em] text-brand uppercase",
        className,
      )}
      {...props}
    >
      {children}
    </p>
  );
}
