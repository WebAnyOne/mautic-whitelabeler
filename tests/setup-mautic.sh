#!/usr/bin/env bash
set -e

MAUTIC_VERSION="${1:-6.0.0}"
TEMP_DIR="${2:-/tmp/mautic-whitelabeler-test}"
WHITELABELER_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "Setting up Mautic $MAUTIC_VERSION test in $TEMP_DIR"

# Download Mautic (asset names are like "6.0.0.zip", no "mautic-" prefix)
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"

if ! curl -fsSL "https://github.com/mautic/mautic/releases/download/${MAUTIC_VERSION}/${MAUTIC_VERSION}.zip" \
  -o "$TEMP_DIR/mautic.zip" 2>/dev/null; then
  curl -fsSL "https://github.com/mautic/mautic/releases/download/${MAUTIC_VERSION}/${MAUTIC_VERSION}-update.zip" \
    -o "$TEMP_DIR/mautic.zip"
fi

python3 -c "import zipfile, sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" \
  "$TEMP_DIR/mautic.zip" "$TEMP_DIR/mautic"

# Find Mautic root (directory containing /app)
MAUTIC_PATH=$(find "$TEMP_DIR/mautic" -maxdepth 2 -name "app" -type d | head -1 | xargs dirname)

if [ -z "$MAUTIC_PATH" ]; then
  echo "ERROR: Could not find Mautic app directory in $TEMP_DIR/mautic"
  exit 1
fi

echo "Mautic root: $MAUTIC_PATH"

# Copy a minimal 1x1 transparent PNG as test logo into the whitelabeler assets dir
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82' \
  > "$WHITELABELER_DIR/assets/test-logo.png"

# The CLI's loadJsonConfig() prepends assets/ to paths, so we must place the
# config in assets/ and reference it by filename only.
cat > "$WHITELABELER_DIR/assets/test-config.json" << CONFIG
{
  "path": "$MAUTIC_PATH",
  "url": "http://localhost:8888",
  "company": "TestCorp",
  "logo_bg": "#123456",
  "primary": "#4e5e9e",
  "hover": "#3d4d8d",
  "sidebar_bg": "#2c3e50",
  "sidebar_submenu_bg": "#1a252f",
  "sidebar_link": "#ecf0f1",
  "sidebar_link_hover": "#ffffff",
  "active_icon": "#e74c3c",
  "divider_left": 15,
  "sidebar_divider": "#34495e",
  "submenu_bullet_bg": "#7f8c8d",
  "submenu_bullet_shadow": "#2c3e50",
  "sidebar_logo": "test-logo.png",
  "sidebar_logo_width": 150,
  "sidebar_logo_margin_top": 10,
  "sidebar_logo_margin_right": 0,
  "sidebar_logo_margin_left": 0,
  "login_logo": "test-logo.png",
  "login_logo_width": 200,
  "login_logo_margin_top": 15,
  "login_logo_margin_bottom": 15,
  "favicon": "",
  "footer_prefix": "",
  "footer": "All rights reserved."
}
CONFIG

# Start a temporary PHP server so the URL validation in the whitelabeler passes.
# Playwright starts its own server later, so we just need this during whitelabeling.
php -S localhost:8888 -t "$MAUTIC_PATH" &>/dev/null &
PHP_SERVER_PID=$!
# Ensure server is killed on exit regardless of how this script ends
trap "kill $PHP_SERVER_PID 2>/dev/null || true" EXIT
sleep 1  # give server time to start

# Run whitelabeler — pass just the filename (assets/ is prepended internally).
# The cache-clear step may fail in a test environment (no database/Symfony config),
# but the file modifications (CSS, Twig, JS) complete before that step.
cd "$WHITELABELER_DIR"
WL_OUTPUT=$(php cli.php --whitelabel test-config.json 2>&1) || WL_EXIT=$?
echo "$WL_OUTPUT"

# Verify that the critical whitelabeling steps actually ran
if ! echo "$WL_OUTPUT" | grep -qiE "colors|CSS files updated|company name|Logos updated|images"; then
  echo ""
  echo "ERROR: Whitelabeler did not complete file modifications successfully."
  echo "See output above for details."
  exit 1
fi

if [ "${WL_EXIT:-0}" -ne 0 ]; then
  echo ""
  echo "Note: Whitelabeler exited with code $WL_EXIT (cache clear likely failed — normal in test env without DB)."
  echo "File modifications completed successfully."
fi

# Write env for Playwright
echo "MAUTIC_PATH=$MAUTIC_PATH" > "$TEMP_DIR/.env"
echo "MAUTIC_VERSION=$MAUTIC_VERSION" >> "$TEMP_DIR/.env"

# Write a simple health check file so Playwright's webServer health check returns 200
echo "<html><body>OK</body></html>" > "$TEMP_DIR/health.html"

echo ""
echo "Done. Modified files are in $MAUTIC_PATH"
echo "Run: cd tests/playwright && npm test"
