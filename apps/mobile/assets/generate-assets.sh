#!/bin/bash
# Generate placeholder app assets using ImageMagick (if available)
# Or use Expo's built-in asset generation

echo "Generating OpsFlux Mobile placeholder assets..."

# Icon (1024x1024) — blue background with white "OF" text
convert -size 1024x1024 xc:"#1e3a5f" \
  -fill white -gravity center -pointsize 300 -annotate 0 "OF" \
  icon.png 2>/dev/null || echo "ImageMagick not available — use Figma or any design tool to create icon.png (1024x1024, #1e3a5f background, white logo)"

# Adaptive icon (1024x1024) — same but with padding
convert -size 1024x1024 xc:"#1e3a5f" \
  -fill white -gravity center -pointsize 200 -annotate 0 "OF" \
  adaptive-icon.png 2>/dev/null || echo "Create adaptive-icon.png (1024x1024, logo smaller, centered)"

# Splash (1284x2778) — centered logo
convert -size 1284x2778 xc:"#1e3a5f" \
  -fill white -gravity center -pointsize 200 -annotate 0 "OpsFlux" \
  splash.png 2>/dev/null || echo "Create splash.png (1284x2778, #1e3a5f, white OpsFlux text centered)"

# Notification icon (96x96) — white on transparent
convert -size 96x96 xc:none \
  -fill white -gravity center -pointsize 40 -annotate 0 "OF" \
  notification-icon.png 2>/dev/null || echo "Create notification-icon.png (96x96, white silhouette on transparent)"

echo "Done. Replace these with your actual brand assets."
