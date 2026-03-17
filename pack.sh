#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_NAME="$(basename "$PROJECT_DIR")"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTPUT_NAME="${PROJECT_NAME}_${TIMESTAMP}.zip"
OUTPUT_PATH="${PROJECT_DIR}/${OUTPUT_NAME}"

EXCLUDES=(
  "node_modules/*"
  "backend/data/*"
  "backend/.env"
  "_archive/*"
  "reports/*"
  ".DS_Store"
  "*.zip"
  "*.log"
  ".vscode/*"
  "dist/*"
  ".wxt/*"
  "__pycache__/*"
  "*.pyc"
  ".git/*"
  "chrome_tab_helper_*"
)

EXCLUDE_ARGS=()
for pat in "${EXCLUDES[@]}"; do
  EXCLUDE_ARGS+=(-x "$pat")
done

cd "$PROJECT_DIR"

zip -r "$OUTPUT_PATH" . "${EXCLUDE_ARGS[@]}" -x "*/node_modules/*" "*/.DS_Store"

FILE_SIZE=$(du -sh "$OUTPUT_PATH" | cut -f1)

echo ""
echo "=========================================="
echo "  Pack complete!"
echo "  File: ${OUTPUT_NAME}"
echo "  Size: ${FILE_SIZE}"
echo "  Path: ${OUTPUT_PATH}"
echo "=========================================="
echo ""
echo "Excluded:"
for pat in "${EXCLUDES[@]}"; do
  echo "  - ${pat}"
done
