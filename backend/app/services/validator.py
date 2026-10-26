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
    new_columns = []
    for c in df.columns:
        if isinstance(c, str):
            new_columns.append(
                c.strip().lower().replace(r"\s+", " ")  # note: this is not regex yet
            )
        else:
            new_columns.append(str(c))  # convert NaN/float to string
    df.columns = new_columns
    # Now properly clean with regex
    df.columns = (
        pd.Index(df.columns)
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


def _load_file(
    file_path: str,
    header: int = 0,
    sheet_name: str | int = 0,
) -> Optional[pd.DataFrame]:
    """
    Load CSV / TSV / Excel file.
    `header` parameter is useful for files that have blank rows above the real headers.
    `sheet_name` is used only for Excel files.
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
            # Excel
            df = pd.read_excel(
                file_path,
                dtype=str,
                header=header,
                sheet_name=sheet_name,
            )
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
    Match working data against ULM using composite key:
        Merchant + Merchant SKU  ↔  site + website part #

    For matched rows:
    - Write ULM's gapuserlabel value into the Part Number column
    - Set tag = "from ulm"
    """
    if not ulm_file_path:
        logger.info("No ULM file provided → skipping ULM enrichment")
        return df

    # ULM has a blank first row → real headers are on row 1
    ulm = _load_file(ulm_file_path, header=1)

    if ulm is None or ulm.empty:
        logger.warning("ULM file could not be loaded → skipping enrichment")
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

    # Part Number column (this is where we will write the ULM value)
    part_number_col = _find_column(
        df,
        [
            "part number", "part_number", "partnumber", "part #", "part#",
            "mpn", "manufacturer part number", "manufacturer_part_number"
        ],
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

    # Keep only non-empty keys + first occurrence (same as VLOOKUP)
    ulm = ulm[ulm["_lookup_key"] != ""]
    ulm_slim = (
        ulm[["_lookup_key", label_col]]
        .drop_duplicates(subset=["_lookup_key"], keep="first")
        .rename(columns={label_col: "_ulm_value"})
    )

    # ---- Merge ----
    before = len(df)
    df = df.merge(ulm_slim, on="_lookup_key", how="left")
    df = df.drop(columns=["_lookup_key"])

    matched_mask = df["_ulm_value"].notna()
    matched_count = matched_mask.sum()

    logger.info(
        f"ULM enrichment → matched {matched_count}/{before} rows "
        f"({matched_count / before * 100:.1f}%)"
    )

    # ------------------------------------------------------------------
    # Write ULM value into Part Number column + set tag
    # ------------------------------------------------------------------
    if part_number_col is None:
        part_number_col = "part number"
        df[part_number_col] = pd.Series([None] * len(df), dtype="object")

    # Force object dtype so strings can be written safely
    df[part_number_col] = df[part_number_col].astype("object")

    # Only overwrite for matched rows
    df.loc[matched_mask, part_number_col] = df.loc[matched_mask, "_ulm_value"]

    # Set tag
    if "tag" not in df.columns:
        df["tag"] = None
    df.loc[matched_mask, "tag"] = "from ulm"

    # Clean up temporary column
    df = df.drop(columns=["_ulm_value"])

    return df


# ---------------------------------------------------------------------------
# Specs Enrichment
# ---------------------------------------------------------------------------
def enrich_with_specs(
    df: pd.DataFrame,
    specs_file_path: str,
) -> pd.DataFrame:
    """
    Specs File Logic 1

    Matching:
        Working DF  →  "merchant part number"
        Specs File  →  "Part Number"  (becomes "part number" after normalization)

    For matched rows:
        - Write Specs "Part Number" value into working DF "part number"
        - Set tag = "from specs"  (overwrites previous "from ulm" if any)
    """
    if not specs_file_path:
        logger.info("No Specs file provided → skipping Specs enrichment")
        return df

    specs = _load_file(specs_file_path, header=3, sheet_name="Specifications")

    if specs is None or specs.empty:
        logger.warning("Specs file could not be loaded → skipping enrichment")
        return df

    logger.info(f"Specs columns after loading: {list(specs.columns)}")

    # ---- Locate columns ----
    # After normalization, Specs "Part Number" becomes "part number"
    specs_part_col = _find_column(specs, ["part number", "part_number", "partnumber"])

    # Working DF columns
    merchant_part_col = _find_column(df, ["merchant part number", "merchant_part_number"])
    part_number_col = _find_column(df, ["part number", "part_number", "partnumber"])

    if not specs_part_col:
        raise ValueError(
            f"Specs file is missing 'Part Number' column.\n"
            f"Available columns: {list(specs.columns)}"
        )

    if not merchant_part_col:
        raise ValueError(
            f"Working data is missing 'merchant part number' column.\n"
            f"Available columns: {list(df.columns)}"
        )

    # ---- Prepare for matching ----
    df = df.copy()
    specs = specs.copy()

    # Create lookup key (just the part number value)
    df["_lookup_key"] = df[merchant_part_col].fillna("").astype(str).str.strip()
    specs["_lookup_key"] = specs[specs_part_col].fillna("").astype(str).str.strip()

    # Remove empty keys + keep first match (VLOOKUP style)
    specs = specs[specs["_lookup_key"] != ""]
    specs_slim = (
        specs[["_lookup_key", specs_part_col]]
        .drop_duplicates(subset=["_lookup_key"], keep="first")
        .rename(columns={specs_part_col: "_specs_value"})
    )

    # ---- Merge ----
    before = len(df)
    df = df.merge(specs_slim, on="_lookup_key", how="left")
    df = df.drop(columns=["_lookup_key"])

    matched_mask = df["_specs_value"].notna()
    matched_count = matched_mask.sum()

    logger.info(
        f"Specs enrichment → matched {matched_count}/{before} rows "
        f"({matched_count / before * 100:.1f}%)"
    )

    # ------------------------------------------------------------------
    # Write Specs value into Part Number + set tag
    # ------------------------------------------------------------------
    if part_number_col is None:
        part_number_col = "part number"
        df[part_number_col] = pd.Series([None] * len(df), dtype="object")

    # Ensure object dtype
    df[part_number_col] = df[part_number_col].astype("object")

    # Overwrite part number for matched rows
    df.loc[matched_mask, part_number_col] = df.loc[matched_mask, "_specs_value"]

    # Set / overwrite tag
    if "tag" not in df.columns:
        df["tag"] = None
    df.loc[matched_mask, "tag"] = "from specs"

    # Clean up
    df = df.drop(columns=["_specs_value"])

    return df




# ---------------------------------------------------------------------------
# Specs Enrichment Brand & Product
# ---------------------------------------------------------------------------


def enrich_with_specs_brand_product(
    df: pd.DataFrame,
    specs_file_path: str,
) -> pd.DataFrame:
    """
    Specs File Logic 2

    Matching:
        Working DF  →  "part number"
        Specs File  →  "Part Number"

    For matched rows:
        - Populate "brand"   ← Specs "QC Brand"
        - Populate "product" ← Specs "Product"
    """
    if not specs_file_path:
        logger.info("No Specs file provided → skipping Specs Brand/Product enrichment")
        return df

    # Important: Specs file header is on row 4 → header=3
    specs = _load_file(specs_file_path, header=3, sheet_name="Specifications")

    if specs is None or specs.empty:
        logger.warning("Specs file could not be loaded → skipping Brand/Product enrichment")
        return df

    logger.info(f"Specs columns (Logic 2): {list(specs.columns)}")

    # ---- Locate columns in Specs ----
    specs_part_col = _find_column(specs, ["part number", "part_number", "partnumber"])
    specs_brand_col = _find_column(specs, ["qc brand", "brand", "qc_brand"])
    specs_product_col = _find_column(specs, ["product"])

    if not specs_part_col:
        raise ValueError(
            f"Specs file is missing 'Part Number' column.\n"
            f"Available: {list(specs.columns)}"
        )
    if not specs_brand_col:
        raise ValueError(
            f"Specs file is missing 'QC Brand' / 'Brand' column.\n"
            f"Available: {list(specs.columns)}"
        )
    if not specs_product_col:
        raise ValueError(
            f"Specs file is missing 'Product' column.\n"
            f"Available: {list(specs.columns)}"
        )

    # ---- Locate columns in working DF ----
    part_number_col = _find_column(df, ["part number", "part_number", "partnumber"])

    if not part_number_col:
        logger.warning("No 'part number' column found in working data → skipping Brand/Product enrichment")
        return df

    # ---- Prepare lookup ----
    df = df.copy()
    specs = specs.copy()

    df["_lookup_key"] = df[part_number_col].fillna("").astype(str).str.strip()
    specs["_lookup_key"] = specs[specs_part_col].fillna("").astype(str).str.strip()

    # Keep first match only
    specs = specs[specs["_lookup_key"] != ""]
    specs_slim = (
        specs[["_lookup_key", specs_brand_col, specs_product_col]]
        .drop_duplicates(subset=["_lookup_key"], keep="first")
        .rename(columns={
            specs_brand_col: "_specs_brand",
            specs_product_col: "_specs_product"
        })
    )

    # ---- Merge ----
    before = len(df)
    df = df.merge(specs_slim, on="_lookup_key", how="left")
    df = df.drop(columns=["_lookup_key"])

    matched_mask = df["_specs_brand"].notna() | df["_specs_product"].notna()
    matched_count = matched_mask.sum()

    logger.info(
        f"Specs Brand/Product enrichment → matched {matched_count}/{before} rows "
        f"({matched_count / before * 100:.1f}%)"
    )

    # ------------------------------------------------------------------
    # Populate brand & product
    # ------------------------------------------------------------------
    if "brand" not in df.columns:
        df["brand"] = pd.Series([None] * len(df), dtype="object")
    if "product" not in df.columns:
        df["product"] = pd.Series([None] * len(df), dtype="object")

    df["brand"] = df["brand"].astype("object")
    df["product"] = df["product"].astype("object")

    df.loc[matched_mask, "brand"] = df.loc[matched_mask, "_specs_brand"]
    df.loc[matched_mask, "product"] = df.loc[matched_mask, "_specs_product"]

    # Clean up
    df = df.drop(columns=["_specs_brand", "_specs_product"])

    return df




# ---------------------------------------------------------------------------
# Discard Enrichment
# ---------------------------------------------------------------------------






def enrich_with_discard(
    df: pd.DataFrame,
    last_working_file_path: str,
) -> pd.DataFrame:
    """
    Last Working File Logic (Discard sheet)

    Matching:
        Working DF  →  "url"
        Discard sheet →  "URL"

    For matched rows:
        - Set part number = "from Discard"
        - Set tag = value from "Reason to Delete" column
    """
    if not last_working_file_path:
        logger.info("No Last Working file provided → skipping Discard enrichment")
        return df

    # Load the "Discard" sheet
    discard = _load_file(
        last_working_file_path,
        header=1,
        sheet_name="Discard"
    )

    if discard is None or discard.empty:
        logger.warning("Discard sheet could not be loaded → skipping enrichment")
        return df

    logger.info(f"Discard sheet columns: {list(discard.columns)}")

    # ---- Locate columns in Discard sheet ----
    discard_url_col = _find_column(discard, ["url"])
    reason_col = _find_column(discard, ["reason to delete", "reason_to_delete", "reason"])

    if not discard_url_col:
        raise ValueError(
            f"Discard sheet is missing 'URL' column.\n"
            f"Available columns: {list(discard.columns)}"
        )
    if not reason_col:
        raise ValueError(
            f"Discard sheet is missing 'Reason to Delete' column.\n"
            f"Available columns: {list(discard.columns)}"
        )

    # ---- Locate columns in working DF ----
    url_col = _find_column(df, ["url", "product_url", "link", "product_link"])
    part_number_col = _find_column(df, ["part number", "part_number", "partnumber"])

    if not url_col:
        logger.warning("No URL column found in working data → skipping Discard enrichment")
        return df

    # ---- Prepare lookup ----
    df = df.copy()
    discard = discard.copy()

    df["_lookup_key"] = df[url_col].fillna("").astype(str).str.strip()
    discard["_lookup_key"] = discard[discard_url_col].fillna("").astype(str).str.strip()

    # Keep first match only
    discard = discard[discard["_lookup_key"] != ""]
    discard_slim = (
        discard[["_lookup_key", reason_col]]
        .drop_duplicates(subset=["_lookup_key"], keep="first")
        .rename(columns={reason_col: "_discard_reason"})
    )

    # ---- Merge ----
    before = len(df)
    df = df.merge(discard_slim, on="_lookup_key", how="left")
    df = df.drop(columns=["_lookup_key"])

    matched_mask = df["_discard_reason"].notna()
    matched_count = matched_mask.sum()

    logger.info(
        f"Discard enrichment → matched {matched_count}/{before} rows "
        f"({matched_count / before * 100:.1f}%)"
    )

    # ------------------------------------------------------------------
    # Populate part number + tag
    # ------------------------------------------------------------------
    if part_number_col is None:
        part_number_col = "part number"
        df[part_number_col] = pd.Series([None] * len(df), dtype="object")

    df[part_number_col] = df[part_number_col].astype("object")

    # Set part number = "from Discard"
    df.loc[matched_mask, part_number_col] = "from Discard"

    # Set tag = Reason to Delete value
    if "tag" not in df.columns:
        df["tag"] = None
    df.loc[matched_mask, "tag"] = df.loc[matched_mask, "_discard_reason"]

    # Clean up
    df = df.drop(columns=["_discard_reason"])

    return df




def compute_validation_breakdown(df: pd.DataFrame) -> dict:
    """
    Computes breakdown of entries in the validated dataset:
    - from discard: checked via 'part number' column == 'from Discard'
    - from ulm: checked via 'tag' column == 'from ulm'
    - from specs: checked via 'tag' column == 'from specs'
    - discard no price: checked via 'tag' column (e.g. 'Discard_No Price')
    """
    part_col = _find_column(df, ["part number", "part_number", "partnumber", "part #", "mpn"])
    tag_col = _find_column(df, ["tag", "tags"])

    from_discard_count = 0
    if part_col:
        part_s = df[part_col].fillna("").astype(str).str.strip().str.lower()
        from_discard_count = int(part_s.str.contains("from discard", na=False).sum())

    from_ulm_count = 0
    from_specs_count = 0
    discard_no_price_count = 0

    if tag_col:
        tag_s = df[tag_col].fillna("").astype(str).str.strip().str.lower()
        from_ulm_count = int(tag_s.str.contains("from ulm", na=False).sum())
        from_specs_count = int(tag_s.str.contains("from specs", na=False).sum())
        discard_no_price_count = int(tag_s.str.contains("no price", na=False).sum())

    return {
        "from_discard": from_discard_count,
        "from_ulm": from_ulm_count,
        "from_specs": from_specs_count,
        "discard_no_price": discard_no_price_count,
        "total": len(df),
    }


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


    # -----------------------------------------------------------------
    # 2. Specs Master enrichment
    # -----------------------------------------------------------------
    df = enrich_with_specs(df, specs_file_path)


    # -----------------------------------------------------------------
    # 3. Specs Master enrichment Brand & Product
    # -----------------------------------------------------------------

    df = enrich_with_specs_brand_product(df, specs_file_path)


    # -----------------------------------------------------------------
    # 4. Last Working File - Discard Logic
    # -----------------------------------------------------------------
    df = enrich_with_discard(df, last_working_file_path)


    # ------------------------------------------------------------------
    # 5. Detect URL column
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
    # 5. Collect known URLs from master files
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
    # 6. Mark status
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

    breakdown = compute_validation_breakdown(df)

    logger.info(
        f"Validation complete → "
        f"Total: {len(df)} | "
        f"NEW: {len(new_products_df)} | "
        f"EXISTING: {len(df) - len(new_products_df)} | "
        f"From Discard (part number): {breakdown['from_discard']} | "
        f"From ULM (tag): {breakdown['from_ulm']} | "
        f"From Specs (tag): {breakdown['from_specs']} | "
        f"Discard No Price (tag): {breakdown['discard_no_price']}"
    )

    return df, new_products_df