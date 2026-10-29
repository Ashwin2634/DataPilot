import asyncio
from typing import List, Dict, Any, Optional
from .router import ScraperRouter
from .models import ProductData

async def scrape_urls_async(
    urls: List[str],
    progress_callback: Optional[Any] = None
) -> List[Dict[str, Any]]:
    """
    Asynchronous entrypoint for FastAPI / async pipelines:
    Pass URLs -> Runs hybrid HTTP / Browser scraper and returns structured model dictionaries.
    """
    router = ScraperRouter()
    return await router.scrape_batch(urls, progress_callback=progress_callback)

def scrape_urls_to_json(
    urls: List[str],
    progress_callback: Optional[Any] = None
) -> List[Dict[str, Any]]:
    """
    Synchronous entrypoint for CLI / standalone scripts:
    Pass 800-1000 URLs -> Returns full structured JSON (including raw JSON-LD and page states).
    """
    router = ScraperRouter()
    return asyncio.run(router.scrape_batch(urls, progress_callback=progress_callback))

def scrape_urls_for_excel(
    urls: List[str],
    progress_callback: Optional[Any] = None
) -> List[Dict[str, Any]]:
    """
    Synchronous entrypoint for your Excel generator:
    Pass 800-1000 URLs -> Returns flattened dictionary rows ready for pd.DataFrame(rows).to_excel().
    """
    raw_results = scrape_urls_to_json(urls, progress_callback=progress_callback)
    return [ProductData(**item).to_excel_row() for item in raw_results]