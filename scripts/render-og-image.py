"""Renders scripts/og-image.html to public/og-image.png (1200x630).

Run from sites-pilot/ with the TerpPlan repo's Python, which has Playwright and uses Microsoft Edge:
  ../.venv/Scripts/python.exe scripts/render-og-image.py
"""

from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel="msedge", headless=True)
    page = browser.new_page(viewport={"width": 1200, "height": 630}, device_scale_factor=1)
    page.goto((ROOT / "scripts" / "og-image.html").as_uri())
    page.screenshot(path=str(ROOT / "public" / "og-image.png"))
    browser.close()
print("wrote public/og-image.png")
