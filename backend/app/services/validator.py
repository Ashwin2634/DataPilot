"""
validator.py
------------
Data Validation Pipeline for Garden Hoses.

1. ULM enrichment  →  populates `gapuserlabel` using composite key
   (Merchant + Merchant SKU  ↔  site + website part #)

2. New vs Existing product detection using URL against:
   - Specs Master
   - ULM
   - Last Working file
"""

import pandas as pd
from pathlib import Path
from typing import Optional, Tuple
import logging

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = (
        df.columns
        .astype(str)
        .str.strip()
        .str.lower()
        .str.replace(r"\s+", " ", regex=True)
    )
    return df


def _find_column(df: pd.DataFrame, candidates: list[str]) -> Optional[str]:
    """Return first matching column (case-insensitive, space-insensitive)."""
    cols = {c.replace(" ", ""): c for c in df.columns}
    for cand in candidates:
        key = cand.lower().replace(" ", "")
        if key in cols:
            return cols[key]
    return None


def _load_file(file_path: str, header: int = 0) -> Optional[pd.DataFrame]:
    """
    Load CSV / TSV / Excel file.
    `header` parameter is useful for files that have blank rows above the real headers.
    """
    if not file_path:
        return None
    try:
        path = Path(file_path)
        if path.suffix.lower() == ".csv":
            df = pd.read_csv(file_path, dtype=str, header=header)
        elif path.suffix.lower() == ".tsv":
            df = pd.read_csv(file_path, sep="\t", dtype=str, header=header)
        else:
            df = pd.read_excel(file_path, dtype=str, header=header)
        return _normalize_columns(df)
    except Exception as e:
        logger.warning(f"Could not load {file_path}: {e}")
        return None


def _extract_urls(df: Optional[pd.DataFrame]) -> set:
    if df is None or df.empty:
        return set()

    url_col = _find_column(
        df,
        ["url", "product_url", "link", "product_link", "supplier_url", "item_url"],
    )
    if url_col is None:
        return set()

    return set(
        df[url_col]
        .astype(str)
        .str.strip()
        .dropna()
        .loc[lambda x: x != ""]
    )


# ---------------------------------------------------------------------------
# ULM Enrichment (composite key logic)
# ---------------------------------------------------------------------------

def enrich_with_ulm(
    df: pd.DataFrame,
    ulm_file_path: str,
) -> pd.DataFrame:
    """
    Replicates the Excel VLOOKUP:

        VLOOKUP(Merchant & Merchant_SKU,
                ULM[site & website_part],
                gapuserlabel)

    Adds column `gapuserlabel` to the dataframe.
    """
    if not ulm_file_path:
        logger.info("No ULM file provided → skipping gapuserlabel enrichment")
        df["gapuserlabel"] = None
        return df

    # IMPORTANT:
    # The ULM file has a blank first row.
    # Real headers are on row 1 → we must use header=1
    ulm = _load_file(ulm_file_path, header=1)

    if ulm is None or ulm.empty:
        logger.warning("ULM file could not be loaded → gapuserlabel will be empty")
        df["gapuserlabel"] = None
        return df

    logger.info(f"ULM columns after loading: {list(ulm.columns)}")

    # ---- Locate required columns in ULM ----
    site_col = _find_column(ulm, ["site"])
    part_col = _find_column(
        ulm,
        ["website part #", "website part", "website_part", "website part number", "websitepart"],
    )
    label_col = _find_column(
        ulm,
        ["gapuserlabel", "gap user label", "gap_user_label", "userlabel", "gapuser label"],
    )

    if not all([site_col, part_col, label_col]):
        missing = []
        if not site_col:
            missing.append("site")
        if not part_col:
            missing.append("website part #")
        if not label_col:
            missing.append("gapuserlabel")
        raise ValueError(
            f"ULM is missing required columns: {missing}\n"
            f"Available columns: {list(ulm.columns)}"
        )

    # ---- Locate required columns in working data ----
    merchant_col = _find_column(df, ["merchant", "marchent", "seller", "retailer"])
    sku_col = _find_column(
        df,
        ["merchant_sku", "merchant sku", "sku", "merchantpart", "merchant part", "part_number"],
    )

    if not merchant_col or not sku_col:
        raise ValueError(
            f"Working data is missing Merchant / Merchant SKU columns.\n"
            f"Available: {list(df.columns)}"
        )

    # ---- Build composite keys ----
    df = df.copy()
    df["_lookup_key"] = (
        df[merchant_col].fillna("").astype(str).str.strip()
        + df[sku_col].fillna("").astype(str).str.strip()
    )

    ulm = ulm.copy()
    ulm["_lookup_key"] = (
        ulm[site_col].fillna("").astype(str).str.strip()
        + ulm[part_col].fillna("").astype(str).str.strip()
    )

    # Drop empty keys + keep first occurrence (same behaviour as VLOOKUP)
    ulm = ulm[ulm["_lookup_key"] != ""]
    ulm_slim = (
        ulm[["_lookup_key", label_col]]
        .drop_duplicates(subset=["_lookup_key"], keep="first")
        .rename(columns={label_col: "gapuserlabel"})
    )

    # ---- Merge ----
    before = len(df)
    df = df.merge(ulm_slim, on="_lookup_key", how="left")
    df = df.drop(columns=["_lookup_key"])

    matched = df["gapuserlabel"].notna().sum()
    logger.info(
        f"ULM enrichment → matched {matched}/{before} rows "
        f"({matched / before * 100:.1f}%)"
    )

    return df


# ---------------------------------------------------------------------------
# Main public function
# ---------------------------------------------------------------------------

async def validate_and_find_new_products(
    cleaned_df: pd.DataFrame,
    specs_file_path: str = None,
    ulm_file_path: str = None,
    last_working_file_path: str = None,
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Data Validation Pipeline

    Steps
    -----
    1. Enrich with ULM → populates `gapuserlabel`
       using composite key (Merchant + Merchant SKU ↔ site + website part #)

    2. Detect NEW vs EXISTING products by comparing URL against:
       - Specs Master
       - ULM
       - Last Working file

    Returns
    -------
    (full_df, new_products_df)
    """
    df = _normalize_columns(cleaned_df)

    # ------------------------------------------------------------------
    # 1. ULM enrichment (gapuserlabel)
    # ------------------------------------------------------------------
    df = enrich_with_ulm(df, ulm_file_path)

    # ------------------------------------------------------------------
    # 2. Detect URL column
    # ------------------------------------------------------------------
    url_col = _find_column(
        df,
        ["url", "product_url", "link", "product_link", "supplier_url", "item_url"],
    )

    if url_col is None:
        # last resort – any column containing "url" or "link"
        for col in df.columns:
            if "url" in col or "link" in col:
                url_col = col
                break

    if url_col is None:
        raise ValueError("No URL column found in cleaned data")

    # ------------------------------------------------------------------
    # 3. Collect known URLs from master files
    # ------------------------------------------------------------------
    known_urls: set = set()

    # Specs Master – normal header
    known_urls |= _extract_urls(_load_file(specs_file_path, header=0))

    # ULM – has blank first row → use header=1
    known_urls |= _extract_urls(_load_file(ulm_file_path, header=1))

    # Last Working file – normal header
    known_urls |= _extract_urls(_load_file(last_working_file_path, header=0))

    logger.info(f"Total known URLs collected: {len(known_urls)}")

    # ------------------------------------------------------------------
    # 4. Mark status
    # ------------------------------------------------------------------
    df["is_new_product"] = ~df[url_col].astype(str).str.strip().isin(known_urls)
    df["match_status"] = df["is_new_product"].map({True: "NEW", False: "EXISTING"})

    # Validation check columns belong strictly to validator stage
    if "SV Note" not in df.columns and "sv note" not in df.columns:
        df["SV Note"] = ""
    if "Brand Check" not in df.columns and "brand check" not in df.columns:
        df["Brand Check"] = ""
    if "cat check" not in df.columns:
        df["cat check"] = ""

    new_products_df = df[df["is_new_product"]].copy()

    logger.info(
        f"Validation complete → "
        f"Total: {len(df)} | "
        f"NEW: {len(new_products_df)} | "
        f"EXISTING: {len(df) - len(new_products_df)}"
    )

    return df, new_products_df