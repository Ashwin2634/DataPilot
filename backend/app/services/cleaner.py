import re
from pathlib import Path
from typing import Tuple, Optional
import numpy as np
import pandas as pd
from app.core.config import settings
import openpyxl
from openpyxl import load_workbook

# ============================================================
# CONFIG (from client's config.py)
# ============================================================

COLUMN_MAP = {
    "Merchant": ["Merchant", "Seller", "Marketplace", "Source", "Retailer"],
    "Date": ["Date", "Crawl Date", "Scraped Date", "Collected Date"],
    "Country": ["Country", "Marketplace Country"],
    "Category": ["Category", "Product Category", "Cat"],

    # ---------- UPDATED PRICE MAPPINGS ----------
    "Shelf Price": [
        "Shelf Price", "Price", "Current Price", "Selling Price", "List Price",
        "Original Price", "Regular Price", "MSRP", "Was Price", "Base Price"
    ],
    "Net Price": [
        "Net Price", "Final Price", "Discounted Price", "Purchase Price",
        "Sale Price", "Deal Price", "Offer Price", "Promo Price"
    ],
    # --------------------------------------------

    "In Stock": ["In Stock", "Availability", "Stock", "Stock Status"],
    "URL": ["URL", "Product URL", "Product Link", "Link", "Supplier URL", "Page URL", "Web URL"],
    "Merchant SKU": ["Merchant SKU", "Merchant Product ID", "Merchant ID", "SKU", "Seller SKU"],
    "Merchant Part Number": [
        "MFR Part Number", "MFR Part #", "Mfr Part Number", "Manufacturer Part Number", "Part Number", "MPN"
    ],
    "Image URL": ["Image URL", "Image", "Img URL", "Product Image"],
    "UPC": ["UPC", "UPC Code", "Barcode"],
    "Brand": ["Brand", "Brand Name", "Manufacturer"],
    "Product": ["Product", "Title", "Product Title", "Name", "Product Name"],
    "Part Number": ["Part Number", "Model", "Model Number", "Model No"],
}

# Cleaned schema for Stage 1 (cleaner)
CLEANED_SCHEMA = [
    "Tag",                      # added by tag_no_price
    "Merchant",
    "Date",
    "Merchant SKU",
    "Merchant Part Number",
    "Part Number",
    "Brand",
    "Product",
    "Shelf Price",
    "Net Price",
    "Final Instant Savings",
    "In Stock",
    "URL",
    "Promo Start Date",
    "Promo End Date",
    "Promo Details",
    "Image URL",
    "UPC",
    "Country",
    "Category",
    "Provider",
]

# Backward compatibility alias
WORKING_SCHEMA = CLEANED_SCHEMA

KEEP_IMAGE_URL = False
PROVIDER_VALUE = "CO7"
NO_PRICE_TAG = "Discard_No Price"


# ============================================================
# Helper functions (from transforms.py)
# ============================================================

def _norm(name: str) -> str:
    return re.sub(r"[\s_-]+", "", str(name).lower().strip())


def _first_matching_col(df: pd.DataFrame, candidates: list[str]) -> Optional[str]:
    norm_map = {_norm(c): c for c in df.columns}
    for cand in candidates:
        key = _norm(cand)
        if key in norm_map:
            return norm_map[key]
    return None


def map_columns(raw: pd.DataFrame) -> pd.DataFrame:
    """Map raw columns -> standard names."""
    out = pd.DataFrame(index=raw.index)

    for target, candidates in COLUMN_MAP.items():
        if target == "Image URL" and not KEEP_IMAGE_URL:
            continue
        src = _first_matching_col(raw, candidates)
        if src is not None:
            out[target] = raw[src]
        else:
            out[target] = np.nan

    return out


def monday_of_week(d: pd.Timestamp) -> pd.Timestamp:
    """Return the Monday of the week that contains d."""
    return d - pd.Timedelta(days=d.weekday())


def clean_merchant(s: pd.Series) -> pd.Series:
    """Remove trailing ': USA' (any spacing/case)."""
    def _clean(val):
        if pd.isna(val):
            return val
        txt = str(val).strip()
        if txt.lower() in ["", "nan", "none"]:
            return np.nan
        return re.sub(r"\s*:\s*USA\s*$", "", txt, flags=re.IGNORECASE)
    return s.map(_clean)


def yes_no(s: pd.Series) -> pd.Series:
    """TRUE/FALSE -> Y/N"""
    mapping = {
        True: "Y", False: "N",
        "TRUE": "Y", "FALSE": "N",
        "true": "Y", "false": "N",
        "True": "Y", "False": "N",
        "Y": "Y", "N": "N",
        "y": "Y", "n": "N",
        "1": "Y", "0": "N",
        "IN STOCK": "Y", "OUT OF STOCK": "N",
        "IN_STOCK": "Y", "OUT_OF_STOCK": "N",
    }
    def _map_val(val):
        if pd.isna(val):
            return val
        cleaned = str(val).strip().upper()
        return mapping.get(cleaned, val)
    return s.map(_map_val)


def pad_upc(s: pd.Series) -> pd.Series:
    """
    Clean UPC values while trying to preserve as many digits as possible.
    Avoids float conversion when the value is already a clean string.
    """
    def _clean_one(val):
        if pd.isna(val) or val is None:
            return pd.NA
        
        val = str(val).strip().replace(",", "")
        
        if val.lower() in ["", "nan", "none", "null"]:
            return pd.NA
        
        # If it already looks like a normal number string → keep it
        if re.fullmatch(r"\d+", val):
            return val
        
        # Handle scientific notation carefully
        if re.search(r"[eE][+-]?\d+", val):
            try:
                # Use Decimal for better precision than float
                from decimal import Decimal, InvalidOperation
                num = Decimal(val)
                return str(int(num))
            except (InvalidOperation, ValueError, OverflowError):
                return val
        
        # Last resort
        try:
            return str(int(float(val)))
        except (ValueError, OverflowError):
            return val

    return s.map(_clean_one)


def apply_cleanups(df: pd.DataFrame, week_monday: pd.Timestamp) -> pd.DataFrame:
    df = df.copy()

    # 1. Date -> Monday of the QC week (pure date only, no timestamp)
    if "Date" in df.columns:
        # Convert to datetime.date so Excel/CSV never shows time
        if hasattr(week_monday, "date"):
            week_monday = week_monday.date()
        df["Date"] = week_monday

    # 2. Merchant clean
    if "Merchant" in df.columns:
        df["Merchant"] = clean_merchant(df["Merchant"])

    # 3. In Stock -> Y/N
    if "In Stock" in df.columns:
        df["In Stock"] = yes_no(df["In Stock"])

    # 4. UPC pad
    if "UPC" in df.columns:
        df["UPC"] = pad_upc(df["UPC"])

    # 5. Provider
    df["Provider"] = PROVIDER_VALUE

    return df


def tag_no_price(df: pd.DataFrame) -> pd.DataFrame:
    """Add Tag column and mark rows with missing Shelf Price."""
    df = df.copy()
    if "Tag" not in df.columns:
        df.insert(0, "Tag", "")

    if "Shelf Price" in df.columns:
        mask = df["Shelf Price"].isna() | (
            df["Shelf Price"].astype(str).str.strip().str.lower().isin(["", "nan", "none", "null"])
        )
        df.loc[mask, "Tag"] = NO_PRICE_TAG
    return df


def sort_by_shelf_price(df: pd.DataFrame) -> pd.DataFrame:
    """Sort rows numerically descending by Shelf Price, preserving original text."""
    if "Shelf Price" not in df.columns:
        return df.reset_index(drop=True)

    def _price_num(series):
        cleaned = series.astype(str).str.replace(r"[^\d.]", "", regex=True)
        return pd.to_numeric(cleaned, errors="coerce")

    return df.sort_values(
        by="Shelf Price",
        key=_price_num,
        ascending=False,
        na_position="last",
        kind="mergesort"
    ).reset_index(drop=True)


def convert_scientific_to_str(val):
    if pd.isna(val) or val == "" or val is None:
        return ""
    
    val = str(val).strip()
    
    # Already a normal number string
    if "e" not in val.lower() and "E" not in val:
        # Remove trailing .0 if present
        if val.endswith(".0"):
            val = val[:-2]
        return val
    
    # Handle scientific notation (e.g. 4.25E+11 or 4.25e+11)
    try:
        return f"{int(float(val))}"
    except (ValueError, OverflowError):
        return val


# ============================================================
# Main Cleaner Pipeline
# ============================================================

async def clean_data(
    qc_file_path: str,
    job_id: str,
    week_date: str = None          # optional "YYYYMMDD"
) -> Tuple[pd.DataFrame, str]:
    """
    Full cleaning pipeline based on the client's VBA -> Python logic.

    Steps:
    1. Load QC file
    2. Remove duplicate URLs
    3. Map columns using COLUMN_MAP
    4. Apply cleanups (Date, Merchant, In Stock, UPC, Provider)
    5. Sort by Shelf Price (numerical descending)
    6. Tag rows with no price ("Discard_No Price")
    7. Reindex to full WORKING_SCHEMA (24 columns starting with Tag)
    8. Save and return
    """

    if not qc_file_path:
        raise ValueError("QC file path is required")

    file_path = Path(qc_file_path)
    if not file_path.exists():
        raise FileNotFoundError(f"QC file not found: {qc_file_path}")

    # ---------- 1. Load ----------
    if file_path.suffix.lower() == ".csv":
        raw = pd.read_csv(file_path, dtype=str, keep_default_na=False)
    else:
        # Excel - try to preserve large numbers as accurately as possible
        wb = load_workbook(file_path, data_only=True)
        ws = wb.active

        headers = [cell.value for cell in ws[1]]
        
        # Detect which column is the UPC column using your COLUMN_MAP
        upc_candidates = COLUMN_MAP.get("UPC", ["UPC", "UPC Code", "Barcode"])
        upc_col_idx = None
        for idx, h in enumerate(headers):
            if h and _norm(str(h)) in {_norm(c) for c in upc_candidates}:
                upc_col_idx = idx
                break

        data = []
        for row in ws.iter_rows(min_row=2):
            row_dict = {}
            for idx, cell in enumerate(row):
                col_name = headers[idx]
                val = cell.value

                # Special handling only for the UPC column
                if idx == upc_col_idx:
                    if val is None:
                        row_dict[col_name] = ""
                    else:
                        # Best effort: convert without going through float if possible
                        try:
                            # If it's already an int
                            if isinstance(val, int):
                                row_dict[col_name] = str(val)
                            # If it's a float that looks like scientific notation
                            elif isinstance(val, float):
                                # Use high precision formatting
                                row_dict[col_name] = f"{val:.0f}"
                            else:
                                row_dict[col_name] = str(val).strip()
                        except Exception:
                            row_dict[col_name] = str(val).strip()
                else:
                    row_dict[col_name] = val

            data.append(row_dict)

        raw = pd.DataFrame(data)
    original_count = len(raw)

    # ---------- 2. De-dupe on URL ----------
    url_col = _first_matching_col(raw, COLUMN_MAP["URL"])
    if url_col is None:
        for c in raw.columns:
            if "url" in str(c).lower() or "link" in str(c).lower():
                url_col = c
                break

    if url_col is None:
        raise ValueError("Raw file has no URL column")

    raw = raw.drop_duplicates(subset=[url_col], keep="first")
    after_dedupe = len(raw)

    # ---------- 3. Map columns ----------
    df = map_columns(raw)

    # Explicitly leave these columns empty in the working file
    for col in ["Part Number", "Brand", "Product"]:
        if col in df.columns:
            df[col] = np.nan

    # ---------- 4. Determine week Monday ----------
    if not week_date:
        # Extract YYYYMMDD from filename if present (e.g. Garden_Hoses_EcomQC_20260803.xlsx)
        date_match = re.search(r"(\d{8})", file_path.name)
        if date_match:
            week_date = date_match.group(1)

    if week_date:
        try:
            week_ts = pd.to_datetime(week_date, format="%Y%m%d")
        except Exception:
            week_ts = pd.Timestamp.today().normalize()
    else:
        week_ts = pd.Timestamp.today().normalize()

    week_monday = monday_of_week(week_ts.normalize()).date()

    # ---------- 5. Apply cleanups ----------
    df = apply_cleanups(df, week_monday)

    # ---------- 6. Sort + Tag ----------
    df = sort_by_shelf_price(df)
    df = tag_no_price(df)

    # ---------- 7. Ensure full CLEANED_SCHEMA ----------
    for col in CLEANED_SCHEMA:
        if col not in df.columns:
            df[col] = np.nan

    df = df.reindex(columns=CLEANED_SCHEMA)

    # ---------- 8. Save ----------
    settings.TEMP_DIR.mkdir(parents=True, exist_ok=True)
    output_path = settings.TEMP_DIR / f"{job_id}_working_cleaned.xlsx"
    csv_output_path = settings.TEMP_DIR / f"{job_id}_working_cleaned.csv"
    df.to_excel(output_path, index=False, sheet_name="Data")
    df.to_csv(csv_output_path, index=False)

    print(f"[CLEANER] Original rows     : {original_count}")
    print(f"[CLEANER] After URL de-dupe : {after_dedupe}")
    print(f"[CLEANER] Tagged No Price   : {(df['Tag'] == NO_PRICE_TAG).sum()}")
    print(f"[CLEANER] Saved -> {output_path} and {csv_output_path}")

    return df, str(output_path)