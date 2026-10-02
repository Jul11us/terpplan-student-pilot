"""Checks that each building's map link opens that building in Google Maps.

The timetable links search Google Maps by the `map` text in data/umd-buildings.json (written by
scripts/build-buildings.mjs). Google's results can change, so run this after rebuilding the data or
when someone reports a link opening the wrong place.

For every building it opens the search and sorts the result into:
  ok         Google opened one place within 250 m of our coordinates, with a matching name
  renamed    one place within 250 m, but Google calls it something else (e.g. Mathematics Building ->
             William E. Kirwan Hall); usually fine, worth a glance
  list       Google showed a list of results instead of one place (expected for a few buildings,
             see MAP_LIST_ONLY and SHM in build-buildings.mjs)
  wrong      the place Google opened is more than 250 m away: fix this building's MAP_QUERY
  no-result  nothing loaded; rerun, Google may be rate-limiting

Exit status is 1 when any building is "wrong".

Needs Python with Playwright and Microsoft Edge (the TerpPlan repo's .venv has both):
  python scripts/check-building-maps.py                 # all buildings
  python scripts/check-building-maps.py --only KEY,SHM  # just these codes
"""

import argparse
import asyncio
import json
import math
import re
import urllib.parse
from pathlib import Path

from playwright.async_api import async_playwright

DATA = Path(__file__).resolve().parent.parent / "data" / "umd-buildings.json"
MAX_METERS = 250
PARALLEL = 4
GENERIC = {"hall", "building", "bldg", "center", "university", "maryland", "of", "and", "the", "residence", "for", "umd", "lab", "laboratory"}


def meters(a, b):
    rad = math.pi / 180
    d_lat = (b[0] - a[0]) * rad
    d_lng = (b[1] - a[1]) * rad
    h = math.sin(d_lat / 2) ** 2 + math.cos(a[0] * rad) * math.cos(b[0] * rad) * math.sin(d_lng / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def words(text):
    return {w for w in re.findall(r"[a-z]+", text.lower()) if len(w) > 2 and w not in GENERIC}


def same_name(ours, google):
    # At least half of the distinctive words in our name appear in Google's place name.
    mine = words(ours)
    return bool(mine) and len(mine & words(google)) * 2 >= len(mine)


async def check(page, code, building):
    url = "https://www.google.com/maps/search/?api=1&query=" + urllib.parse.quote(building["map"])
    await page.goto(url, wait_until="domcontentloaded")
    for _ in range(24):
        await page.wait_for_timeout(500)
        found = re.search(r"!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)", page.url)
        if "/maps/place/" in page.url and found:
            heading = page.locator("h1").first
            title = (await heading.inner_text()) if await heading.count() else ""
            distance = round(meters((building["lat"], building["lng"]), (float(found.group(1)), float(found.group(2)))))
            if distance > MAX_METERS:
                return "wrong", title, distance
            return ("ok" if same_name(building["name"], title) else "renamed"), title, distance
        if await page.locator('div[role="feed"]').count():
            labels = [await link.get_attribute("aria-label") or "" for link in (await page.locator('div[role="feed"] a[aria-label]').all())[:2]]
            return "list", " | ".join(labels), None
    return "no-result", "", None


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", help="comma-separated building codes")
    args = parser.parse_args()
    buildings = json.loads(DATA.read_text(encoding="utf-8"))
    codes = [code.strip().upper() for code in args.only.split(",")] if args.only else list(buildings)
    missing = [code for code in codes if code not in buildings]
    if missing:
        raise SystemExit(f"Unknown building codes: {', '.join(missing)}")

    queue = asyncio.Queue()
    for code in codes:
        queue.put_nowait(code)
    results = {}

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(channel="msedge", headless=True)
        context = await browser.new_context(locale="en-US", viewport={"width": 1280, "height": 900})

        async def worker():
            page = await context.new_page()
            while not queue.empty():
                code = queue.get_nowait()
                building = buildings[code]
                try:
                    results[code] = await check(page, code, building)
                except Exception as error:  # a timeout on one building should not stop the run
                    results[code] = ("no-result", str(error).splitlines()[0], None)
                status, title, distance = results[code]
                print(f"{status:9} {code:7} {building['map'][:55]:55} -> {title[:45]}{'' if distance is None else f' ({distance} m)'}", flush=True)

        await asyncio.gather(*(worker() for _ in range(PARALLEL)))
        await browser.close()

    counts = {}
    for status, _, _ in results.values():
        counts[status] = counts.get(status, 0) + 1
    print("\n" + ", ".join(f"{status}: {count}" for status, count in sorted(counts.items())))
    for label in ("wrong", "no-result", "renamed", "list"):
        codes_with = sorted(code for code, (status, _, _) in results.items() if status == label)
        if codes_with:
            print(f"{label}: {', '.join(codes_with)}")
    return 1 if counts.get("wrong") else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
