// Groups a course's sections that share an instructor and a lecture (for example CMSC131-0101 to
// 0105: one lecture, five discussions), so the course page shows the lecture and the instructor's
// rating once and lists only what differs between the sections.

type MeetingLike = { days?: string | null; start_time?: string | null; end_time?: string | null; building?: string | null; room?: string | null };
type SectionLike = { instructors?: string[]; meetings?: MeetingLike[] };

export type SectionGroup<S extends SectionLike> = {
  key: string;
  sections: S[];
  // Meetings every section in the group has (the lecture). Empty for a group of one.
  shared: MeetingLike[];
};

export const meetingKey = (meeting: MeetingLike) =>
  [meeting.days, meeting.start_time, meeting.end_time, meeting.building, meeting.room].map((part) => (part ?? "").trim()).join("|");

export function groupSections<S extends SectionLike>(sections: S[]): SectionGroup<S>[] {
  const groups: SectionGroup<S>[] = [];
  const byKey = new Map<string, SectionGroup<S>>();
  sections.forEach((section, index) => {
    const first = section.meetings?.[0];
    // A section with no set time (or no instructor yet) stays on its own: there is nothing shared to show.
    const groupable = Boolean(first?.start_time && first.days && section.instructors?.length);
    const key = groupable ? [...(section.instructors ?? [])].sort().join(", ") + "#" + meetingKey(first!) : "#" + index;
    const group = byKey.get(key);
    if (group) group.sections.push(section);
    else { const created = { key, sections: [section], shared: [] }; byKey.set(key, created); groups.push(created); }
  });
  for (const group of groups) {
    if (group.sections.length < 2) continue;
    const [head, ...rest] = group.sections;
    group.shared = (head.meetings ?? []).filter((meeting) => rest.every((section) => (section.meetings ?? []).some((other) => meetingKey(other) === meetingKey(meeting))));
  }
  return groups;
}

// The meetings a section has beyond the group's shared lecture.
export function ownMeetings(section: SectionLike, shared: MeetingLike[]) {
  const sharedKeys = new Set(shared.map(meetingKey));
  return (section.meetings ?? []).filter((meeting) => !sharedKeys.has(meetingKey(meeting)));
}
