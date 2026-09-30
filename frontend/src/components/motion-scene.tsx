import Image from "next/image";
import { cn } from "@/lib/cn";

export type SceneVariant =
  | "about"
  | "dataset"
  | "department"
  | "home"
  | "paper"
  | "people"
  | "position"
  | "project";

const SCENES: Record<SceneVariant, string> = {
  about: "/illustrations/about-mission.svg",
  dataset: "/illustrations/datasets-curation.svg",
  department: "/illustrations/departments.svg",
  home: "/illustrations/home-neural-network.svg",
  paper: "/illustrations/papers-citations.svg",
  people: "/illustrations/peoples.svg",
  position: "/illustrations/positions.svg",
  project: "/illustrations/projects-lanes.svg",
};

/** Decorative animated page illustration. Every scene sits in a page hero. */
export function MotionScene({
  className,
  variant,
}: {
  className?: string;
  variant: SceneVariant;
}) {
  return (
    <Image
      alt=""
      aria-hidden="true"
      className={cn("pointer-events-none h-auto object-contain", className)}
      height={480}
      priority
      src={SCENES[variant]}
      unoptimized
      width={640}
    />
  );
}
