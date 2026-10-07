// The courses a student has finished or is taking, for prerequisite checks in the planner. Saved in this
// browser only (never sent to the server). Filled from the degree audit page or typed in by the student.

import type { AuditResult } from "@/lib/degree-audit";
import { storageKey } from "@/lib/demo";

export const TAKEN_KEY = "terpplan:taken";
// Same-tab updates; other tabs hear the "storage" event.
export const TAKEN_EVENT = "terpplan:taken-changed";

// credits: credits the student will have finished by next term (earned plus in progress), for courses
// that need a number of credits ("24 credit hours completed"). Optional.
export type TakenCourses = { completed: string[]; inProgress: string[]; credits?: number; source: "audit" | "manual"; updatedAt: string };

const CODE = /^[A-Z]{4}\d{3}[A-Z]?$/;

// A credit count as typed or stored: 0–250, or undefined.
export function parseCredits(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value.trim()) : NaN;
  return Number.isFinite(number) && number >= 0 && number <= 250 ? Math.round(number * 10) / 10 : undefined;
}

// Course codes from free text: "cmsc131, MATH 140; stat400" -> ["CMSC131", "MATH140", "STAT400"].
export function parseCourseCodes(text: string): string[] {
  const codes = (text.toUpperCase().match(/[A-Z]{4}\s?\d{3}[A-Z]?/g) ?? []).map((code) => code.replace(/\s/g, ""));
  return [...new Set(codes.filter((code) => CODE.test(code)))];
}

export function readTaken(): TakenCourses | null {
  try {
    return parseTaken(JSON.parse(window.localStorage.getItem(storageKey(TAKEN_KEY)) ?? "null"));
  } catch {
    return null;
  }
}

// Checks a stored (or transferred) value; null when it holds no usable course codes or credit count.
export function parseTaken(raw: unknown): TakenCourses | null {
  const value = raw as Partial<TakenCourses> | null;
  if (!value || typeof value !== "object") return null;
  const list = (items: unknown) => Array.isArray(items) ? items.filter((item): item is string => typeof item === "string" && CODE.test(item)) : [];
  const completed = list(value.completed);
  const inProgress = list(value.inProgress);
  const credits = parseCredits(value.credits);
  if (!completed.length && !inProgress.length && credits === undefined) return null;
  return { completed, inProgress, ...(credits === undefined ? {} : { credits }), source: value.source === "audit" ? "audit" : "manual", updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "" };
}

export function writeTaken(value: Omit<TakenCourses, "updatedAt"> | null) {
  try {
    if (!value || (!value.completed.length && !value.inProgress.length && value.credits === undefined)) window.localStorage.removeItem(storageKey(TAKEN_KEY));
    else window.localStorage.setItem(storageKey(TAKEN_KEY),JSON.stringify({ ...value, updatedAt: new Date().toISOString() }));
  } catch {
    // Storage blocked: the check simply stays off.
  }
  window.dispatchEvent(new Event(TAKEN_EVENT));
}

// Import only the parser's passing and in-progress course lists, after the student chooses to use them.
export function writeTakenFromAudit(audit: AuditResult) {
  const credits = audit.completedCredits + audit.inProgressCredits;
  writeTaken({ completed: audit.completedCourseIds, inProgress: audit.inProgressCourseIds, ...(credits > 0 ? { credits: Math.round(credits * 10) / 10 } : {}), source: "audit" });
}
