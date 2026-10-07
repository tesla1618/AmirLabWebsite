import type {
  Person,
  Position,
  PublicStats,
  AboutContent,
  Department,
  HomeContent,
  ResearchItem,
  ResearchItemType,
  SiteContentResponse,
  University,
} from "./types";
import { DEFAULT_ABOUT_CONTENT, DEFAULT_HOME_CONTENT } from "./site-content";

import "server-only";
import { connection } from "next/server";
import { publicFetch } from "./public-cache";

async function getCollection<T>(path: string, live = false): Promise<T[]> {
  try {
    const response = await publicFetch(path, live);
    if (!response.ok) {
      throw new Error(`API returned ${response.status} for ${path}`);
    }
    return (await response.json()) as T[];
  } catch (error) {
    await connection();
    console.error(`Unable to load ${path}`, error);
    return [];
  }
}

export function getPeople(): Promise<Person[]> {
  return getCollection<Person>("/people");
}

export async function getPerson(slug: string): Promise<Person | null> {
  try {
    const response = await publicFetch(`/people/${encodeURIComponent(slug)}`);
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`API returned ${response.status} for person ${slug}`);
    }
    return (await response.json()) as Person;
  } catch (error) {
    await connection();
    console.error(`Unable to load person ${slug}`, error);
    return null;
  }
}

export function getPositions(): Promise<Position[]> {
  return getCollection<Position>("/positions", true);
}

export function getResearch(type?: ResearchItemType): Promise<ResearchItem[]> {
  const query = type ? `?type=${type}` : "";
  return getCollection<ResearchItem>(`/research${query}`);
}

export function getDepartments(): Promise<Department[]> {
  return getCollection<Department>("/departments");
}

export function getUniversities(): Promise<University[]> {
  return getCollection<University>("/universities");
}

export async function getDepartment(slug: string): Promise<Department | null> {
  try {
    const response = await publicFetch(
      `/departments/${encodeURIComponent(slug)}`,
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    return (await response.json()) as Department;
  } catch (error) {
    await connection();
    console.error(`Unable to load department ${slug}`, error);
    return null;
  }
}

export async function getResearchItem(
  slug: string,
): Promise<ResearchItem | null> {
  try {
    const response = await publicFetch(`/research/${encodeURIComponent(slug)}`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    return (await response.json()) as ResearchItem;
  } catch (error) {
    await connection();
    console.error(`Unable to load research item ${slug}`, error);
    return null;
  }
}

export async function getPublicStats(): Promise<PublicStats> {
  try {
    const response = await publicFetch("/stats", false, 60);
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    return (await response.json()) as PublicStats;
  } catch (error) {
    await connection();
    console.error("Unable to load public statistics", error);
    return { papers: 0, people: 0, datasets: 0, projects: 0, openPositions: 0 };
  }
}

async function getSiteContent<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await publicFetch(`/site-content/${path}`);
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    return ((await response.json()) as SiteContentResponse<T>).content;
  } catch (error) {
    await connection();
    console.error(`Unable to load ${path} site content`, error);
    return fallback;
  }
}

export function getHomeContent(): Promise<HomeContent> {
  return getSiteContent("home", DEFAULT_HOME_CONTENT);
}

export function getAboutContent(): Promise<AboutContent> {
  return getSiteContent("about", DEFAULT_ABOUT_CONTENT);
}
