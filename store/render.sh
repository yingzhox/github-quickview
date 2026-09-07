#!/usr/bin/env bash
# Renders the Chrome Web Store assets from src/assets.html.
# Screenshots and promo tiles are flattened to JPEG because the store
# rejects PNGs carrying an alpha channel.
set -euo pipefail

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SRC="file://$(cd "$(dirname "$0")/src" && pwd)/assets.html"
OUT="$(cd "$(dirname "$0")" && pwd)/out"
mkdir -p "$OUT"

shot() { # frame width height scale outfile
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
    --force-device-scale-factor="$4" --window-size="$2,$3" \
    --screenshot="$OUT/$5" "$SRC?frame=$1" >/dev/null 2>&1
}

shot icon    128 128 1 icon-128.png
shot s1     1280 800 1 screenshot-1.png
shot s2     1280 800 1 screenshot-2.png
shot s3     1280 800 1 screenshot-3.png
shot s4     1280 800 1 screenshot-4.png
shot small   440 280 1 promo-small.png
shot marquee 1400 560 1 promo-marquee.png

# Extension icons scale down from the 128 master.
for size in 48 32 16; do
  cp "$OUT/icon-128.png" "$OUT/icon-$size.png"
  sips -z "$size" "$size" "$OUT/icon-$size.png" >/dev/null
done

# Flatten everything except the icons; JPEG cannot carry alpha.
for f in screenshot-1 screenshot-2 screenshot-3 screenshot-4 promo-small promo-marquee; do
  sips -s format jpeg -s formatOptions 92 "$OUT/$f.png" --out "$OUT/$f.jpg" >/dev/null
  rm "$OUT/$f.png"
done
