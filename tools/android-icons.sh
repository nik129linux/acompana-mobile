#!/bin/sh
# Launcher icons from the app's own art. Rerun: sh tools/android-icons.sh
# - ic_launcher(.png|_round.png) from icons/icon-192.png (48/72/96/144/192)
# - ic_launcher_foreground.png from icons/icon-maskable-512.png (108/162/216/324/432)
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
SRC="$ROOT/icons/icon-192.png"
MASK="$ROOT/icons/icon-maskable-512.png"
RES="$ROOT/android/app/src/main/res"

sizes="mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192"
for pair in $sizes; do
  d="${pair%%:*}"
  s="${pair##*:}"
  mkdir -p "$RES/mipmap-$d"
  if [ "$d" = "xxxhdpi" ]; then
    cp "$SRC" "$RES/mipmap-$d/ic_launcher.png"
    cp "$SRC" "$RES/mipmap-$d/ic_launcher_round.png"
  else
    magick "$SRC" -resize "${s}x${s}!" "$RES/mipmap-$d/ic_launcher.png"
    magick "$SRC" -resize "${s}x${s}!" "$RES/mipmap-$d/ic_launcher_round.png"
  fi
done

fsizes="mdpi:108 hdpi:162 xhdpi:216 xxhdpi:324 xxxhdpi:432"
for pair in $fsizes; do
  d="${pair%%:*}"
  s="${pair##*:}"
  mkdir -p "$RES/mipmap-$d"
  magick "$MASK" -resize "${s}x${s}!" "$RES/mipmap-$d/ic_launcher_foreground.png"
done
echo "android icons done"
