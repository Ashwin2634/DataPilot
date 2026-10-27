#!/bin/bash

# ============================================================
# Cleanup Excel files older than 2 hours
# Folders: uploads, temp, outputs
# ============================================================

BASE_DIR="/var/www/demo-python/backend/storage"

FOLDERS=("uploads" "temp" "outputs")

LOG_FILE="/var/log/excel_cleanup.log"

echo "----------------------------------------" >> "$LOG_FILE"
echo "$(date): Starting Excel cleanup..." >> "$LOG_FILE"

for folder in "${FOLDERS[@]}"; do
    TARGET="$BASE_DIR/$folder"

    if [ -d "$TARGET" ]; then
        DELETED=$(find "$TARGET" -type f \( -name "*.xlsx" -o -name "*.xls" \) -mmin +120 -print -delete | wc -l)
        echo "$(date): Cleaned $DELETED files from $TARGET" >> "$LOG_FILE"
    else
        echo "$(date): Folder not found → $TARGET" >> "$LOG_FILE"
    fi
done

echo "$(date): Cleanup finished" >> "$LOG_FILE"