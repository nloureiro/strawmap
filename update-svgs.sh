#!/usr/bin/env bash
set -euo pipefail

# Google Drawing IDs
MAIN_ID="1GkcGfQv9kxgrYQMyu0BYGcZya0gIDG_wQ7GsFJEsdzY"
FAQ_ID="1zGpaQe9axN8VnSs4W8P_FOdcwsmqQFESQmeAicSOnQk"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SVG_DIR="$SCRIPT_DIR/svg"
TMP_DIR="$SCRIPT_DIR/.tmp-svg-build"

# Check dependencies
for cmd in curl pdftotext python3; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: $cmd not found. Install it first." >&2
    echo "  pdftotext: apt install poppler-utils (or brew install poppler)" >&2
    exit 1
  fi
done

mkdir -p "$SVG_DIR" "$TMP_DIR"

process_drawing() {
  local name="$1" id="$2"
  local base_url="https://docs.google.com/drawings/d/${id}"

  echo "=== Processing: $name (${id:0:12}…) ==="

  echo "  Downloading SVG…"
  curl -sL "${base_url}/export/svg" -o "$TMP_DIR/${name}.raw.svg"

  echo "  Downloading PDF…"
  curl -sL "${base_url}/export/pdf" -o "$TMP_DIR/${name}.pdf"

  echo "  Injecting searchable text…"
  python3 "$SCRIPT_DIR/inject-text.py" \
    "$TMP_DIR/${name}.raw.svg" \
    "$TMP_DIR/${name}.pdf" \
    "$SVG_DIR/${name}.svg"

  echo "  Done → svg/${name}.svg"
  echo
}

process_drawing "main" "$MAIN_ID"
process_drawing "faq"  "$FAQ_ID"

# Clean up temp files
rm -rf "$TMP_DIR"

echo "All SVGs updated."
