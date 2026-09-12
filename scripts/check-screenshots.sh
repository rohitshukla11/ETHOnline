#!/usr/bin/env bash
# Lists which required screenshots are present and which are still missing.
#   npm run check:screenshots
cd "$(dirname "$0")/.." || exit 1
DIR=docs/screenshots
FILES=(
  "01-hashscan-worldidregistry-verified.png"
  "02-hashscan-mockusdc-verified.png"
  "03-hashscan-warehousereceipt-verified.png"
  "04-hashscan-godaamvault-verified.png"
  "05-hashscan-mockcreforwarder-verified.png"
  "06-verify-page-with-live-app-id.png"
  "07-gate-refusals-terminal.png"
  "08-api-403-invalid-format.png"
  "09-api-403-insufficient-level.png"
)
have=0
for f in "${FILES[@]}"; do
  if [ -f "$DIR/$f" ]; then
    sz=$(du -h "$DIR/$f" | cut -f1 | tr -d ' ')
    printf "  \033[32m✓\033[0m %-46s %s\n" "$f" "$sz"; have=$((have+1))
  else
    printf "  \033[31m✗\033[0m %-46s missing\n" "$f"
  fi
done
echo
echo "  $have of ${#FILES[@]} captured"
[ "$have" -eq "${#FILES[@]}" ] && echo "  All present." || echo "  See $DIR/README.md for what each must show."
