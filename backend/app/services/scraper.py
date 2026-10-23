import pandas as pd
import asyncio
from playwright.async_api import async_playwright
from bs4 import BeautifulSoup
import random


async def scrape_single_product(page, url: str) -> dict:
    """
    Scrape one product page.
    Customize selectors according to Amazon / Walmart structure.
    """
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(random.randint(1500, 3000))  # strategic delay

        content = await page.content()
        try:
            soup = BeautifulSoup(content, "lxml")
        except Exception:
            soup = BeautifulSoup(content, "html.parser")

        # ---------- Example extraction (customize this) ----------
        title = soup.select_one("span#productTitle") or soup.select_one("h1")
        price = soup.select_one("span.a-price-whole") or soup.select_one(".price")
        brand = soup.select_one("#bylineInfo") or soup.select_one(".brand")
        
        # Availability example
        availability = "In Stock"
        avail_elem = soup.select_one("#availability")
        if avail_elem and "out of stock" in avail_elem.get_text().lower():
            availability = "Out of Stock"

        return {
            "scraped_title": title.get_text(strip=True) if title else None,
            "scraped_price": price.get_text(strip=True) if price else None,
            "scraped_brand": brand.get_text(strip=True) if brand else None,
            "scraped_availability": availability,
            "scrape_status": "success"
        }
    except Exception as e:
        return {
            "scraped_title": None,
            "scraped_price": None,
            "scraped_brand": None,
            "scraped_availability": None,
            "scrape_status": f"failed: {str(e)[:100]}"
        }


async def scrape_new_products(validated_df: pd.DataFrame, new_products_df: pd.DataFrame, log_callback=None):
    """
    Scrape only new products and merge results back.
    Optionally accepts a log_callback(message) to stream progress.
    """
    if new_products_df.empty:
        validated_df["scrape_status"] = "not_needed"
        return validated_df

    url_col = None
    for candidate in ["URL", "url", "product_url", "link", "product_link"]:
        if candidate in new_products_df.columns:
            url_col = candidate
            break
    if not url_col:
        for col in new_products_df.columns:
            if "url" in str(col).lower() or "link" in str(col).lower():
                url_col = col
                break
    if not url_col:
        url_col = new_products_df.columns[0]

    urls = new_products_df[url_col].tolist()

    results = []

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            page = await context.new_page()

            for idx, url in enumerate(urls, 1):
                if log_callback:
                    await log_callback(f"Scraping [{idx}/{len(urls)}]: {url[:60]}...")
                data = await scrape_single_product(page, url)
                data["url"] = url
                results.append(data)

                # Strategic delay between requests
                await asyncio.sleep(random.uniform(2.0, 4.5))

            await browser.close()
    except Exception as e:
        if log_callback:
            await log_callback(f"Scraper notice: {str(e)[:120]}")
        for url in urls:
            if not any(r.get("url") == url for r in results):
                results.append({
                    "url": url,
                    "scraped_title": None,
                    "scraped_price": None,
                    "scraped_brand": None,
                    "scraped_availability": None,
                    "scrape_status": f"skipped: {str(e)[:100]}"
                })

    # Convert results to DataFrame
    scraped_df = pd.DataFrame(results)

    # Merge back into the main validated_df
    final_df = validated_df.merge(
        scraped_df,
        left_on=url_col,
        right_on="url",
        how="left",
        suffixes=("", "_scraped")
    )

    return final_df
