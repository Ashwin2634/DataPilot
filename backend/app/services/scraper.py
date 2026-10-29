import asyncio
import logging
from typing import Optional, List, Dict, Any, Tuple
import pandas as pd

from scraper_engine.router import ScraperRouter
from scraper_engine.models import ProductData

logger = logging.getLogger("ScraperService")


def find_url_column(df: pd.DataFrame) -> Optional[str]:
    """Find the column name representing the product URL in df."""
    candidates = ["URL", "url", "product_url", "link", "product_link", "supplier_url", "item_url", "Item URL"]
    for c in candidates:
        if c in df.columns:
            return c
    for c in df.columns:
        col_lower = str(c).lower()
        if "url" in col_lower or "link" in col_lower:
            return c
    return None


def find_tag_column(df: pd.DataFrame) -> Optional[str]:
    """Find the column name representing the Tag in df."""
    candidates = ["Tag", "tag", "Tags", "tags"]
    for c in candidates:
        if c in df.columns:
            return c
    for c in df.columns:
        if "tag" in str(c).lower():
            return c
    return None


def is_blank_value(val: Any) -> bool:
    """Check if a cell value is null, empty string, or nan."""
    if val is None or pd.isna(val):
        return True
    s = str(val).strip().lower()
    return s == "" or s in ("nan", "none", "null")


async def scrape_blank_tag_products(
    validated_df: pd.DataFrame,
    log_callback: Optional[Any] = None
) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Scrapes product details using scraper_engine for rows where the 'Tag' column is blank.
    
    Workflow:
    1. Scan validated_df for rows with a blank tag column.
    2. Extract their merchant URLs.
    3. Run scraper_engine (HTTP + Browser hybrid pipeline) concurrently.
    4. Enrich missing working fields (Product, Brand, Shelf Price, In Stock, etc.)
       and merge explicit scraped attributes into the resulting DataFrame.
    """
    if validated_df.empty:
        return validated_df.copy(), {"total": 0, "success": 0, "failed": 0, "skipped": 0}

    tag_col = find_tag_column(validated_df)
    url_col = find_url_column(validated_df)

    if not tag_col:
        msg = "No 'Tag' column found in validated data. Skipping scraper stage."
        logger.warning(msg)
        if log_callback:
            await log_callback(msg)
        return validated_df.copy(), {"total": 0, "success": 0, "failed": 0, "skipped": 0}

    if not url_col:
        msg = "No 'URL' column found in validated data. Cannot scrape products."
        logger.warning(msg)
        if log_callback:
            await log_callback(msg)
        return validated_df.copy(), {"total": 0, "success": 0, "failed": 0, "skipped": 0}

    # 1. Identify rows with blank tag column
    blank_mask = validated_df[tag_col].apply(is_blank_value)
    blank_df = validated_df[blank_mask]
    blank_count = len(blank_df)

    if blank_count == 0:
        msg = f"Zero blank '{tag_col}' rows detected in validated data ({len(validated_df):,} total rows). Scraping not required."
        logger.info(msg)
        if log_callback:
            await log_callback(msg)
        res_df = validated_df.copy()
        res_df["scrape_status"] = "not_needed"
        return res_df, {"total": 0, "success": 0, "failed": 0, "skipped": 0}

    # 2. Extract valid HTTP/HTTPS URLs
    raw_urls = blank_df[url_col].dropna().astype(str).str.strip().tolist()
    valid_urls = [u for u in raw_urls if u.startswith("http://") or u.startswith("https://")]

    # Deduplicate while preserving order
    seen = set()
    unique_urls: List[str] = []
    for u in valid_urls:
        if u not in seen:
            seen.add(u)
            unique_urls.append(u)

    if not unique_urls:
        msg = f"Found {blank_count} blank '{tag_col}' rows, but none had valid HTTP/HTTPS URLs."
        logger.warning(msg)
        if log_callback:
            await log_callback(msg)
        res_df = validated_df.copy()
        res_df["scrape_status"] = "no_valid_url"
        return res_df, {"total": 0, "success": 0, "failed": 0, "skipped": blank_count}

    init_msg = (
        f"Detected {blank_count} blank '{tag_col}' row(s) corresponding to {len(unique_urls)} "
        f"unique URL(s). Dispatching to Scraper Engine..."
    )
    logger.info(init_msg)
    if log_callback:
        await log_callback(init_msg)

    # 3. Execute batch scrape with ScraperRouter
    router = ScraperRouter()
    raw_results = await router.scrape_batch(unique_urls, progress_callback=log_callback)

    # 4. Map structured scraper outputs
    scraped_rows = []
    success_count = 0
    failed_count = 0

    for item in raw_results:
        status = item.get("status", "failed")
        if status == "success":
            success_count += 1
        else:
            failed_count += 1

        in_stock_val = item.get("in_stock")
        avail_str = "In Stock" if in_stock_val is True else ("Out of Stock" if in_stock_val is False else None)

        scraped_rows.append({
            "_scrape_lookup_url": item.get("url", "").strip(),
            "scraped_title": item.get("title"),
            "scraped_brand": item.get("brand"),
            "scraped_price": item.get("price"),
            "scraped_currency": item.get("currency", "USD"),
            "scraped_availability": avail_str,
            "scraped_sku": item.get("sku"),
            "scraped_upc": item.get("upc_gtin"),
            "scraped_model": item.get("model_number"),
            "scraped_merchant": item.get("merchant"),
            "scraped_engine": item.get("engine_used"),
            "scrape_status": status,
            "scraped_error": item.get("error_message"),
        })

    scraped_df = pd.DataFrame(scraped_rows)

    # 5. Merge results back into validated_df
    final_df = validated_df.copy()
    final_df["_scrape_lookup_url"] = final_df[url_col].astype(str).str.strip()

    final_df = final_df.merge(
        scraped_df,
        on="_scrape_lookup_url",
        how="left"
    )
    final_df.drop(columns=["_scrape_lookup_url"], inplace=True)

    # 6. Fill missing values in blank-tag rows where scraping returned valid data
    for idx in blank_df.index:
        # Product / Title
        for col_name in ["Product", "Title", "product", "title"]:
            if col_name in final_df.columns:
                if is_blank_value(final_df.at[idx, col_name]) and final_df.at[idx, "scraped_title"]:
                    final_df.at[idx, col_name] = final_df.at[idx, "scraped_title"]
                break

        # Brand
        for col_name in ["Brand", "brand"]:
            if col_name in final_df.columns:
                if is_blank_value(final_df.at[idx, col_name]) and final_df.at[idx, "scraped_brand"]:
                    final_df.at[idx, col_name] = final_df.at[idx, "scraped_brand"]
                break

        # Shelf Price
        for col_name in ["Shelf Price", "shelf price", "Price", "price"]:
            if col_name in final_df.columns:
                if is_blank_value(final_df.at[idx, col_name]) and final_df.at[idx, "scraped_price"] is not None:
                    final_df.at[idx, col_name] = final_df.at[idx, "scraped_price"]
                break

        # In Stock
        for col_name in ["In Stock", "in stock", "availability", "Availability"]:
            if col_name in final_df.columns:
                if is_blank_value(final_df.at[idx, col_name]) and final_df.at[idx, "scraped_availability"]:
                    final_df.at[idx, col_name] = final_df.at[idx, "scraped_availability"]
                break

    stats = {
        "blank_tag_rows": blank_count,
        "total": len(unique_urls),
        "success": success_count,
        "failed": failed_count,
        "skipped": 0,
    }

    done_msg = f"Scraping completed: {success_count}/{len(unique_urls)} succeeded, {failed_count} failed."
    logger.info(done_msg)
    if log_callback:
        await log_callback(done_msg)

    return final_df, stats


async def scrape_new_products(
    validated_df: pd.DataFrame,
    new_products_df: Optional[pd.DataFrame] = None,
    log_callback: Optional[Any] = None
) -> pd.DataFrame:
    """
    Backward-compatible entry point: Scrapes products for blank tag rows.
    """
    final_df, _ = await scrape_blank_tag_products(validated_df, log_callback=log_callback)
    return final_df
