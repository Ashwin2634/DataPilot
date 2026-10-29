import json
import pandas as pd
from scraper_engine import scrape_urls_to_json, scrape_urls_for_excel

# 1. Upstream pipeline provides the 800-1000 merchant URLs
urls_to_scrape = [
    "https://www.amazon.com/dp/B08N5WRWNW",
    "https://www.walmart.com/ip/5028504699",
    "https://www.homedepot.com/p/314969083",
    "https://www.bestbuy.com/site/6525420.p",
    "https://www.lowes.com/pd/5005382237",
    "https://www.acehardware.com/departments/tools/power-tools/cordless-drills/2015524",
    "https://www.harborfreight.com/20v-brushless-cordless-12-in-drilldriver-kit-58958.html",
    "https://www.tractorsupply.com/tsc/product/dewalt-20v-max-compact-drill-driver-kit-dcd771c2",
    "https://www.northerntool.com/products/milwaukee-m18-fuel-1-2in-hammer-drill-driver-kit-model-2904-22-115241",
    "https://www.costco.com/.product.100851565.html",
    "https://www.menards.com/main/p-1444452222345.htm",
]

# 2. Run the Scraper Engine
structured_json_data = scrape_urls_to_json(urls_to_scrape)

# 3A. Save full structured JSON output (includes raw_json_ld & raw_page_state)
with open("scraped_output.json", "w", encoding="utf-8") as f:
    json.dump(structured_json_data, f, indent=2, ensure_ascii=False)

# 3B. Or feed directly into your downstream Excel pipeline
excel_rows = scrape_urls_for_excel(urls_to_scrape)
df = pd.DataFrame(excel_rows)
df.to_excel("merchant_products.xlsx", index=False)