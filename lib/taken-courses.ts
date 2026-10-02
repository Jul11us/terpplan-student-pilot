// The courses a student has finished or is taking, for prerequisite checks in the planner. Saved in this
// browser only (never sent to the server). Filled from the degree audit page or typed in by the student.

import type { AuditResult } from "@/lib/degree-audit";

export const TAKEN_KEY = "terpplan:taken";
// Same-tab updates; other tabs hear the "storage" event.
export const TAKEN_EVENT = "terpplan:taken-changed";

export type TakenCourses = { completed: string[]; inProgress: string[]; source: "audit" | "manual"; updatedAt: string };

const CODE = /^[A-Z]{4}\d{3}[A-Z]?$/;

// Course codes from free text: "cmsc131, MATH 140; stat400" -> ["CMSC131", "MATH140", "STAT400"].
export function parseCourseCodes(text: string): string[] {
  const codes = (text.toUpperCase().match(/[A-Z]{4}\s?\d{3}[A-Z]?/g) ?? []).map((code) => code.replace(/\s/g, ""));
  return [...new Set(codes.filter((code) => CODE.test(code)))];
}

export function readTaken(): TakenCourses | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(TAKEN_KEY) ?? "null") as Partial<TakenCourses> | null;
    if (!value || typeof value !== "object") return null;
    const list = (items: unknown) => Array.isArray(items) ? items.filter((item): item is string => typeof item === "string" && CODE.test(item)) : [];
    const completed = list(value.completed);
    const inProgress = list(value.inProgress);
    if (!completed.length && !inProgress.length) return null;
    return { completed, inProgress, source: value.source === "audit" ? "audit" : "manual", updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "" };
  } catch {
    return null;
  }
}

export function writeTaken(value: Omit<TakenCourses, "updatedAt"> | null) {
  try {
    if (!value || (!value.completed.length && !value.inProgress.length)) window.localStorage.removeItem(TAKEN_KEY);
    else window.localStorage.setItem(TAKEN_KEY, JSON.stringify({ ...value, updatedAt: new Date().toISOString() }));
  } catch {
    // Storage blocked: the check simply stays off.
  }
  window.dispatchEvent(new Event(TAKEN_EVENT));
}

// Import only the parser's passing and in-progress course lists, after the student chooses to use them.
export function writeTakenFromAudit(audit: AuditResult) {
  writeTaken({ completed: audit.completedCourseIds, inProgress: audit.inProgressCourseIds, source: "audit" });
}
