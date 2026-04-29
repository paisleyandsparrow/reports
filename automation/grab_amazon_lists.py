"""
grab_amazon_lists.py
--------------------
Proof-of-concept: load Amazon session cookies from Supabase,
inject them into a Playwright browser, and scrape the user's lists.

Usage:
    pip install playwright supabase
    playwright install chromium
    python grab_amazon_lists.py  # reads SUPABASE_KEY from .env
"""

import json
import os
import sys

import requests
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright

# Load .env from the current working directory (or script directory as fallback)
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")) or load_dotenv()

# ── Config ────────────────────────────────────────────────────────────────────

SUPABASE_URL = "https://wzmtzpcqbaisqwjiigdx.supabase.co"
SUPABASE_ANON_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6bXR6cGNxYmFpc3F3amlpZ2R4Iiwicm9sZSI6"
    "ImFub24iLCJpYXQiOjE3NzUxNjgyNTksImV4cCI6MjA5MDc0NDI1OX0"
    ".qlFCCc1t_nlA_WOLXATEgc_zd0AXLuuIsGowldpM5Mw"
)
SERVICE_KEY = os.environ.get("SUPABASE_KEY", "")

# ── Fetch cookies from Supabase ───────────────────────────────────────────────

def fetch_cookies() -> list[dict]:
    if not SERVICE_KEY:
        print("ERROR: SUPABASE_KEY not found. Add it to the .env file.")
        sys.exit(1)

    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/user_amazon_sessions",
        params={"select": "cookies,user_agent", "is_valid": "eq.true", "limit": "1"},
        headers={
            "apikey": SERVICE_KEY,
            "Authorization": f"Bearer {SERVICE_KEY}",
        },
        timeout=10,
    )
    resp.raise_for_status()
    rows = resp.json()
    if not rows:
        print("No valid Amazon session found in database.")
        sys.exit(1)

    row = rows[0]
    cookies = row["cookies"]
    if isinstance(cookies, str):
        cookies = json.loads(cookies)
    print(f"✓ Loaded {len(cookies)} cookies from Supabase (user_agent: {row.get('user_agent', 'n/a')[:60]}…)")
    return cookies


# ── Convert to Playwright cookie format ──────────────────────────────────────

def to_playwright_cookies(raw: list[dict]) -> list[dict]:
    result = []
    for c in raw:
        pc = {
            "name": c["name"],
            "value": c["value"],
            "domain": c["domain"],
            "path": c.get("path", "/"),
            "secure": c.get("secure", False),
            "httpOnly": c.get("httpOnly", False),
        }
        exp = c.get("expirationDate")
        if exp:
            pc["expires"] = int(exp)
        same = c.get("sameSite", "unspecified")
        # Playwright accepts: "Strict" | "Lax" | "None"
        same_map = {"no_restriction": "None", "lax": "Lax", "strict": "Strict"}
        pc["sameSite"] = same_map.get(same, "None")
        result.append(pc)
    return result


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    raw_cookies = fetch_cookies()
    pw_cookies = to_playwright_cookies(raw_cookies)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/147.0.0.0 Safari/537.36"
            )
        )
        context.add_cookies(pw_cookies)
        page = context.new_page()

        print("\nNavigating to Amazon Lists…")
        page.goto("https://www.amazon.com/hz/wishlist/ls", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(2000)

        # Check we're logged in
        title = page.title()
        print(f"Page title: {title}")

        # Grab list names
        list_items = page.query_selector_all("h2 span, [data-testid='list-name'], .a-list-item h2")
        if not list_items:
            # Fallback: try the nav greeting to confirm login
            greeting = page.query_selector("#nav-link-accountList-nav-line-1")
            if greeting:
                print(f"\n✓ Logged in as: {greeting.inner_text()}")
            # Try broader list selector
            list_items = page.query_selector_all("span[class*='wl-list-name'], .wl-list-info h2, h3.a-spacing-none")

        if list_items:
            print(f"\n✓ Found {len(list_items)} list(s):")
            for item in list_items:
                text = item.inner_text().strip()
                if text:
                    print(f"  • {text}")
        else:
            print("\nCould not find list names automatically — but check the browser window to confirm login worked.")

        # Take a screenshot as proof
        screenshot_path = os.path.join(os.path.dirname(__file__), "amazon_lists_screenshot.png")
        page.screenshot(path=screenshot_path, full_page=False)
        print(f"\n📸 Screenshot saved: {screenshot_path}")
        browser.close()


if __name__ == "__main__":
    main()
