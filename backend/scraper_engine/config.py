import os
import random
import uuid
import logging
from pathlib import Path
from typing import Optional, List, Dict
from urllib.parse import urlparse
try:
    from dotenv import load_dotenv
    _env_path = Path(__file__).resolve().parent.parent / ".env"
    if _env_path.exists():
        load_dotenv(_env_path)
    else:
        load_dotenv()
except Exception:
    pass
from curl_cffi import requests as cffi_requests

logger = logging.getLogger("ScraperEngine")


class ScraperConfig:
    # 1. ProxyScrape Account API Key (Used for v4 Account API & Dynamic Proxy Fetching)
    PS_API_KEY_NAME: str = os.getenv("PROXYSCRAPE_API_KEY_NAME", "Kkey")
    PS_API_KEY: str = os.getenv(
        "PROXYSCRAPE_API_KEY",
        "r0NmOs78dI8GTMrZ2Pg3yUmFHvjKZmfkIZBOVE4xP7nEgJF6dx1uDdgaN1TSeXyj",
    )

    # 2. ProxyScrape Residential Gateway Credentials (from Dashboard -> Residential -> Proxy Setup)
    # If set, uses rp.scrapegw.com:6060. If left blank, falls back to ProxyScrape API proxy list.
    PS_RESIDENTIAL_USER: str = os.getenv("PROXYSCRAPE_RES_USER", "")
    PS_RESIDENTIAL_PASS: str = os.getenv("PROXYSCRAPE_RES_PASS", "")
    PS_RESIDENTIAL_HOST: str = os.getenv("PROXYSCRAPE_RES_HOST", "rp.scrapegw.com")
    PS_RESIDENTIAL_PORT: str = os.getenv("PROXYSCRAPE_RES_PORT", "6060")
    PS_COUNTRY: str = os.getenv("PROXYSCRAPE_COUNTRY", "us")

    # 3. Concurrency & Timeout Settings for 800-1000 URLs
    HTTP_CONCURRENCY: int = int(os.getenv("HTTP_CONCURRENCY", "20"))
    BROWSER_CONCURRENCY: int = int(os.getenv("BROWSER_CONCURRENCY", "8"))
    MAX_RETRIES: int = 3
    TIMEOUT_SECONDS: int = 30

    # Cached pool of proxies fetched via ProxyScrape API (when not using Residential Gateway)
    _api_proxy_pool: List[str] = []

    # Domains routed directly to Browser Automation Engine first
    BROWSER_FIRST_DOMAINS = {
        "bestbuy.com",
        "lowes.com",
        "costco.com",
        "menards.com",
        "harborfreight.com",
    }

    @classmethod
    def initialize_proxyscrape_api(cls) -> None:
        """
        Uses your ProxyScrape v4 Account API Key (api-token) to verify account permissions
        and preload a fallback proxy pool if Residential Gateway credentials aren't set.
        """
        headers = {"api-token": cls.PS_API_KEY, "Accept": "application/json"}
        try:
            # 1. Verify v4 API Token & Check Account Context
            resp = cffi_requests.get(
                "https://api.proxyscrape.com/v4/account/api-keys/permission-context",
                headers=headers,
                timeout=10,
                verify=False,
            )
            if resp.status_code == 200:
                logger.info(
                    f"ProxyScrape API Key '{cls.PS_API_KEY_NAME}' authenticated successfully."
                )
            else:
                logger.warning(
                    f"ProxyScrape v4 API returned status {resp.status_code}. Check token permissions."
                )
        except Exception as e:
            logger.warning(f"Could not verify ProxyScrape v4 API key: {e}")

        # 2. If Residential Gateway user/pass isn't configured yet, pull live US proxies from ProxyScrape API
        if not cls.PS_RESIDENTIAL_USER or not cls.PS_RESIDENTIAL_PASS:
            try:
                proxy_list_url = (
                    f"https://api.proxyscrape.com/v4/free-proxy-list/get"
                    f"?request=display_proxies&protocol=http&country={cls.PS_COUNTRY},ca"
                    f"&ssl=yes&anonymity=elite,anonymous&timeout=5000&proxy_format=protocolipport&format=text"
                )
                r = cffi_requests.get(proxy_list_url, headers=headers, timeout=15, verify=False)

                if r.status_code == 200 and r.text.strip():
                    cls._api_proxy_pool = [
                        line.strip()
                        for line in r.text.splitlines()
                        if line.strip().startswith("http")
                    ]
                    logger.info(
                        f"Loaded {len(cls._api_proxy_pool)} proxies from ProxyScrape API for development testing."
                    )
            except Exception as e:
                logger.warning(f"Failed to load fallback proxy list from ProxyScrape API: {e}")

    @classmethod
    def get_rotating_proxy(cls) -> Optional[str]:
        """
        Returns a per-request rotating proxy URL for the HTTP Client Engine (curl_cffi).
        """
        # Priority 1: ProxyScrape Rotating Residential Gateway (rp.scrapegw.com:6060)
        if cls.PS_RESIDENTIAL_USER and cls.PS_RESIDENTIAL_PASS:
            user_formatted = f"{cls.PS_RESIDENTIAL_USER}-country-{cls.PS_COUNTRY}"
            return f"http://{user_formatted}:{cls.PS_RESIDENTIAL_PASS}@{cls.PS_RESIDENTIAL_HOST}:{cls.PS_RESIDENTIAL_PORT}"

        # Priority 2: Rotate through proxies fetched via ProxyScrape API
        if cls._api_proxy_pool:
            return random.choice(cls._api_proxy_pool)

        return None

    @classmethod
    def get_sticky_proxy(cls) -> Optional[Dict[str, str]]:
        """
        Returns a sticky session proxy dictionary for the Playwright/Patchright Browser Engine.
        Keeps the same US Windows IP for 5 minutes so multi-request page loads don't trigger Akamai.
        """
        # Priority 1: ProxyScrape Sticky Residential Gateway
        if cls.PS_RESIDENTIAL_USER and cls.PS_RESIDENTIAL_PASS:
            session_id = uuid.uuid4().hex[:10]
            sticky_username = (
                f"{cls.PS_RESIDENTIAL_USER}-country-{cls.PS_COUNTRY}"
                f"-os-windows-session-{session_id}-lifetime-5"
            )
            return {
                "server": f"http://{cls.PS_RESIDENTIAL_HOST}:{cls.PS_RESIDENTIAL_PORT}",
                "username": sticky_username,
                "password": cls.PS_RESIDENTIAL_PASS,
            }

        # Priority 2: Fallback to API proxy pool
        if cls._api_proxy_pool:
            return {"server": random.choice(cls._api_proxy_pool)}

        return None

    @staticmethod
    def extract_base_domain(url: str) -> str:
        netloc = urlparse(url).netloc.lower()
        return netloc[4:] if netloc.startswith("www.") else netloc