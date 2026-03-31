#!/usr/bin/env python3
"""
Take mobile-width screenshots of all /explorer/* and /social/* pages
on lotusia.org using Selenium (non-headless Chrome).
"""

import os
import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

BASE = "https://lotusia.org"
MOBILE_WIDTH = 375
MOBILE_HEIGHT = 812
OUTDIR = os.path.join(os.path.dirname(__file__), "screenshots_mobile")

STATIC_PAGES = [
    "/explorer",
    "/explorer/blocks",
    "/social/activity",
    "/social/trending",
    "/social/profiles",
]


def setup_driver():
    opts = Options()
    mobile_emulation = {
        "deviceMetrics": {"width": MOBILE_WIDTH, "height": MOBILE_HEIGHT, "pixelRatio": 2.0},
        "userAgent": (
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
            "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 "
            "Mobile/15E148 Safari/604.1"
        ),
    }
    opts.add_experimental_option("mobileEmulation", mobile_emulation)
    return webdriver.Chrome(options=opts)


def full_page_screenshot(driver, path):
    """Scroll through the whole page and save a full-height screenshot."""
    total_height = driver.execute_script("return document.body.scrollHeight")
    driver.set_window_size(MOBILE_WIDTH, max(total_height, MOBILE_HEIGHT))
    time.sleep(0.4)
    driver.save_screenshot(path)
    driver.set_window_size(MOBILE_WIDTH, MOBILE_HEIGHT)


def wait_for_page(driver, timeout=12):
    """Wait until the main content area is present."""
    try:
        WebDriverWait(driver, timeout).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "main, .table-responsive, [data-pagination-group], h1"))
        )
    except Exception:
        pass
    time.sleep(1.5)


def slug(url_path):
    return url_path.strip("/").replace("/", "_") or "root"


def scrape_dynamic_links(driver):
    """From /explorer and /social/activity, extract real block/tx/address/profile links."""
    links = {"block": None, "tx": None, "address": None, "profile": None}

    driver.get(f"{BASE}/explorer")
    wait_for_page(driver)
    for a in driver.find_elements(By.CSS_SELECTOR, "a[href]"):
        href = a.get_attribute("href") or ""
        if "/explorer/block/" in href and not links["block"]:
            links["block"] = href.replace(BASE, "")
        if "/explorer/tx/" in href and not links["tx"]:
            links["tx"] = href.replace(BASE, "")
        if "/explorer/address/" in href and not links["address"]:
            links["address"] = href.replace(BASE, "")

    driver.get(f"{BASE}/explorer/blocks")
    wait_for_page(driver)
    for a in driver.find_elements(By.CSS_SELECTOR, "a[href]"):
        href = a.get_attribute("href") or ""
        if "/explorer/block/" in href and not links["block"]:
            links["block"] = href.replace(BASE, "")

    driver.get(f"{BASE}/social/activity")
    wait_for_page(driver)
    for a in driver.find_elements(By.CSS_SELECTOR, "a[href]"):
        href = a.get_attribute("href") or ""
        if "/social/" in href and "/activity" not in href and "/trending" not in href and "/profiles" not in href:
            if not links["profile"]:
                links["profile"] = href.replace(BASE, "")

    if not links["profile"]:
        driver.get(f"{BASE}/social/profiles")
        wait_for_page(driver)
        for a in driver.find_elements(By.CSS_SELECTOR, "a[href]"):
            href = a.get_attribute("href") or ""
            if "/social/" in href and "/activity" not in href and "/trending" not in href and "/profiles" not in href:
                if not links["profile"]:
                    links["profile"] = href.replace(BASE, "")

    return links


def main():
    os.makedirs(OUTDIR, exist_ok=True)
    driver = setup_driver()

    try:
        print("Scraping real entity links …")
        dynamic = scrape_dynamic_links(driver)
        print(f"  block:   {dynamic['block']}")
        print(f"  tx:      {dynamic['tx']}")
        print(f"  address: {dynamic['address']}")
        print(f"  profile: {dynamic['profile']}")

        all_pages = list(STATIC_PAGES)
        for key in ("block", "tx", "address", "profile"):
            if dynamic[key]:
                all_pages.append(dynamic[key])

        for page_path in all_pages:
            url = f"{BASE}{page_path}"
            name = slug(page_path)
            out = os.path.join(OUTDIR, f"{name}.png")
            print(f"  → {url}")
            driver.get(url)
            wait_for_page(driver)
            full_page_screenshot(driver, out)
            print(f"    saved {out}")

        print(f"\nDone — {len(all_pages)} screenshots in {OUTDIR}/")
    finally:
        driver.quit()


if __name__ == "__main__":
    main()
