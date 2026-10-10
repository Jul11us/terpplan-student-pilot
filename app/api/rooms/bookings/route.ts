import { bookingsFor, nextDate } from "@/lib/room-bookings";
import { easternClock } from "@/lib/rooms";

// Today's (or tomorrow's) 25Live bookings for the empty-room finder: { date, syncedAt, rooms: { "<25Live id>":
// [[start, end], ...] } }, times only. Rooms missing here fall back to their weekly class times on the page.
export async function GET(request: Request) {
  const today = easternClock().date;
  const date = new URL(request.url).searchParams.get("date") ?? today;
  if (date !== today && date !== nextDate(today)) return Response.json({ error: "Use today's or tomorrow's date." }, { status: 400 });
  try {
    const { bookings, syncedAt } = await bookingsFor(date);
    return Response.json({ date, syncedAt, rooms: Object.fromEntries(bookings) }, { headers: { "Cache-Control": "public, max-age=120" } });
  } catch {
    return Response.json({ date, syncedAt: null, rooms: {} }, { status: 503 });
  }
}
