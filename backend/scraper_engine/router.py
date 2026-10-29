import asyncio
import logging
import random
from typing import List, Dict, Any, Optional
from curl_cffi.requests import AsyncSession

try:
    from patchright.async_api import async_playwright
except ImportError:
    from playwright.async_api import async_playwright

from .config import ScraperConfig
from .models import ProductData
from .parsers import ParsingLayer

logger = logging.getLogger("ScraperEngine")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

BLOCK_SIGNATURES = [
    "access denied",
    "robot or human",
    "verify you are human",
    "pardon our interruption",
    "px-captcha",
    "challenge-platform",
    "automated access to amazon data",
    "reference #",
]

def _is_windows_selector_loop() -> bool:
    import sys
    if sys.platform != "win32":
        return False
    try:
        loop = asyncio.get_running_loop()
        return loop.__class__.__name__ == "_WindowsSelectorEventLoop"
    except Exception:
        return False


class ScraperRouter:

    def __init__(self):
        self.http_sem = asyncio.Semaphore(ScraperConfig.HTTP_CONCURRENCY)
        self.browser_sem = asyncio.Semaphore(ScraperConfig.BROWSER_CONCURRENCY)

    @staticmethod
    def _is_blocked_or_empty(html: str) -> bool:
        if not html or len(html) < 4000:
            return True
        lower_sample = html[:15000].lower()
        if "application/ld+json" in lower_sample or "__next_data__" in lower_sample:
            return False
        return any(sig in lower_sample for sig in BLOCK_SIGNATURES)

    async def _fetch_http(self, url: str) -> Optional[str]:
        """HTTP Client Engine: Uses curl_cffi + ProxyScrape Rotating Proxy."""
        headers = {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
            "Upgrade-Insecure-Requests": "1",
        }

        async with self.http_sem:
            for attempt in range(1, ScraperConfig.MAX_RETRIES + 1):
                proxy = ScraperConfig.get_rotating_proxy()
                # On final retry during free-proxy dev testing, allow direct connection fallback
                if attempt == ScraperConfig.MAX_RETRIES and not ScraperConfig.PS_RESIDENTIAL_USER:
                    proxy = None
                proxies = {"http": proxy, "https": proxy} if proxy else None

                try:
                    async with AsyncSession(proxies=proxies, impersonate="chrome124", verify=False) as session:
                        resp = await session.get(
                            url, headers=headers, timeout=ScraperConfig.TIMEOUT_SECONDS, allow_redirects=True
                        )
                        if resp.status_code == 200 and not self._is_blocked_or_empty(resp.text):
                            return resp.text
                except Exception as e:
                    logger.debug(f"[HTTP Attempt {attempt}] {url} via {proxy} failed: {e}")
                await asyncio.sleep(random.uniform(0.4, 1.2))
        return None

    async def _fetch_browser(self, url: str, browser) -> Optional[str]:
        """Browser Automation Engine: Uses Stealth Chromium + ProxyScrape Sticky Session."""
        async with self.browser_sem:
            for attempt in range(1, ScraperConfig.MAX_RETRIES + 1):
                proxy_cfg = ScraperConfig.get_sticky_proxy()
                if attempt == ScraperConfig.MAX_RETRIES and not ScraperConfig.PS_RESIDENTIAL_USER:
                    proxy_cfg = None
                context = None
                try:
                    context = await browser.new_context(
                        proxy=proxy_cfg,
                        ignore_https_errors=True,
                        viewport={"width": 1920, "height": 1080},
                        locale="en-US",
                        timezone_id="America/New_York",
                        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
                    )

                    await context.add_init_script("""
                        Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
                        window.chrome = { runtime: {} };
                        Object.defineProperty(navigator, 'languages', {get: () => ['en-US', 'en']});
                    """)

                    page = await context.new_page()

                    # Bandwidth Saver: Abort heavy images/media/fonts
                    await page.route(
                        "**/*.{png,jpg,jpeg,webp,gif,svg,woff,woff2,ttf,mp4,webm,avi}",
                        lambda route: route.abort(),
                    )

                    await page.goto(url, wait_until="domcontentloaded", timeout=ScraperConfig.TIMEOUT_SECONDS * 1000)
                    await page.wait_for_timeout(random.randint(1800, 3000))

                    html = await page.content()
                    if not self._is_blocked_or_empty(html):
                        return html
                except Exception as e:
                    logger.debug(f"[Browser Attempt {attempt}] {url} failed: {e}")
                finally:
                    if context:
                        await context.close()
                await asyncio.sleep(random.uniform(1.0, 2.0))
        return None

    async def scrape_single_url(self, url: str, browser) -> ProductData:
        domain = ScraperConfig.extract_base_domain(url)
        html = None
        engine_used = "http"

        if domain not in ScraperConfig.BROWSER_FIRST_DOMAINS:
            html = await self._fetch_http(url)
            if html:
                parsed = ParsingLayer.parse(html, url, engine_used="http")
                if parsed.title and (parsed.price is not None or domain == "costco.com"):
                    return parsed

        engine_used = "browser"
        if browser is not None:
            html = await self._fetch_browser(url, browser)
            if html:
                return ParsingLayer.parse(html, url, engine_used=engine_used)

        return ProductData(
            url=url,
            merchant=domain,
            status="failed",
            engine_used=engine_used,
            error_message="Blocked by WAF or proxy timeout after max retries",
        )

    def _run_with_proactor(
        self,
        urls: List[str],
        progress_callback: Optional[Any],
        caller_loop: asyncio.AbstractEventLoop,
    ) -> List[Dict[str, Any]]:
        """Worker thread entrypoint configuring WindowsProactorEventLoop for subprocess compatibility."""
        from asyncio.windows_events import WindowsProactorEventLoopPolicy
        asyncio.set_event_loop_policy(WindowsProactorEventLoopPolicy())
        thread_loop = asyncio.new_event_loop()
        asyncio.set_event_loop(thread_loop)

        async def bridge_callback(msg: str):
            if progress_callback and caller_loop and not caller_loop.is_closed():
                try:
                    if asyncio.iscoroutinefunction(progress_callback):
                        asyncio.run_coroutine_threadsafe(progress_callback(msg), caller_loop)
                    else:
                        caller_loop.call_soon_threadsafe(progress_callback, msg)
                except Exception as ex:
                    logger.debug(f"Progress callback bridge error: {ex}")

        try:
            return thread_loop.run_until_complete(
                self._scrape_batch_internal(
                    urls,
                    progress_callback=bridge_callback if progress_callback else None,
                )
            )
        finally:
            thread_loop.close()

    async def _scrape_batch_internal(
        self,
        urls: List[str],
        progress_callback: Optional[Any] = None,
    ) -> List[Dict[str, Any]]:
        logger.info(f"Starting batch scrape for {len(urls)} URLs...")
        browser = None
        playwright_cm = None
        p = None

        try:
            playwright_cm = async_playwright()
            p = await playwright_cm.__aenter__()
            browser = await p.chromium.launch(
                headless=True,
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                ],
            )
        except Exception as e:
            logger.warning(f"Browser launch unavailable ({e}). Continuing in HTTP-only mode.")

        completed_count = 0
        total_count = len(urls)

        async def _tracked_scrape(u: str) -> ProductData:
            nonlocal completed_count
            res = await self.scrape_single_url(u, browser)
            completed_count += 1
            if progress_callback:
                status_text = "Success" if res.status == "success" else f"Failed: {res.error_message or 'Unknown'}"
                u_display = (u[:55] + "...") if len(u) > 55 else u
                msg = f"Scraped [{completed_count}/{total_count}] {u_display} -> {status_text}"
                try:
                    if asyncio.iscoroutinefunction(progress_callback):
                        await progress_callback(msg)
                    else:
                        progress_callback(msg)
                except Exception as err:
                    logger.debug(f"Progress callback error: {err}")
            return res

        try:
            tasks = [_tracked_scrape(url) for url in urls]
            results: List[ProductData] = await asyncio.gather(*tasks)
        finally:
            if browser:
                try:
                    await browser.close()
                except Exception:
                    pass
            if playwright_cm and p:
                try:
                    await playwright_cm.__aexit__(None, None, None)
                except Exception:
                    pass

        success_count = sum(1 for r in results if r.status == "success")
        logger.info(f"Batch completed: {success_count}/{len(urls)} succeeded.")
        return [r.model_dump() for r in results]

    async def scrape_batch(
        self,
        urls: List[str],
        progress_callback: Optional[Any] = None,
    ) -> List[Dict[str, Any]]:
        # Initialize ProxyScrape API key & proxy pool before starting batch
        ScraperConfig.initialize_proxyscrape_api()

        # Windows workaround: When running under Uvicorn --reload, the main event loop
        # is _WindowsSelectorEventLoop, which does not support subprocesses required by Playwright/Patchright.
        # Spawning in a worker thread with WindowsProactorEventLoopPolicy resolves this.
        if _is_windows_selector_loop():
            caller_loop = asyncio.get_running_loop()
            return await asyncio.to_thread(
                self._run_with_proactor, urls, progress_callback, caller_loop
            )

        return await self._scrape_batch_internal(urls, progress_callback=progress_callback)
