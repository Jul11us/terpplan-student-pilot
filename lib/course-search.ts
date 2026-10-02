export type SearchCourse = { course_id: string; name: string; department?: string; credits?: string };
export type CourseSearchState = {
  key: string;
  status: "loading" | "ready" | "error";
  results: SearchCourse[];
  error: string;
};

const EMPTY_RESULTS: SearchCourse[] = [];

export function courseSearchKey(query: string, term: string) {
  return JSON.stringify([term, query.trim().toLowerCase()]);
}

// Hide a previous query's results immediately, including the render before effect cleanup.
export function courseSearchView(state: CourseSearchState, query: string, term: string) {
  if (query.trim().length < 2) return { results: EMPTY_RESULTS, searching: false, error: "" };
  if (state.key !== courseSearchKey(query, term)) return { results: EMPTY_RESULTS, searching: true, error: "" };
  return { results: state.results, searching: state.status === "loading", error: state.error };
}

export function startCourseSearch(
  query: string,
  term: string,
  onUpdate: (state: CourseSearchState) => void,
  fallbackError: string,
  { delayMs = 250, fetcher = fetch }: { delayMs?: number; fetcher?: typeof fetch } = {},
) {
  const text = query.trim();
  if (text.length < 2) return () => {};
  const key = courseSearchKey(text, term);
  const controller = new AbortController();
  let cancelled = false;
  const timeout = setTimeout(async () => {
    onUpdate({ key, status: "loading", results: EMPTY_RESULTS, error: "" });
    try {
      const response = await fetcher(`/api/search?q=${encodeURIComponent(text)}&term=${encodeURIComponent(term)}`, { signal: controller.signal });
      const payload = await response.json() as { results?: SearchCourse[]; error?: string };
      if (!response.ok) throw new Error(payload.error || fallbackError);
      if (!cancelled) onUpdate({ key, status: "ready", results: payload.results ?? EMPTY_RESULTS, error: "" });
    } catch (cause) {
      if (!cancelled) onUpdate({ key, status: "error", results: EMPTY_RESULTS, error: cause instanceof Error ? cause.message : fallbackError });
    }
  }, delayMs);
  return () => {
    cancelled = true;
    clearTimeout(timeout);
    controller.abort();
  };
}
