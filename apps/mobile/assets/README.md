# Assets

Place the following image assets in this directory:

| File | Size | Description |
|------|------|-------------|
| `icon.png` | 1024x1024 | App icon (square, no transparency) |
| `adaptive-icon.png` | 1024x1024 | Android adaptive icon foreground |
| `splash.png` | 1284x2778 | Splash screen (iPhone 14 Pro Max resolution) |
| `notification-icon.png` | 96x96 | Android notification icon (white on transparent) |

## Guidelines

- **icon.png**: Square, no rounded corners (OS applies them). Use the OpsFlux logo on #1e3a5f background.
- **adaptive-icon.png**: Same as icon but with extra padding (icon should be ~66% of canvas). Android crops a circle/squircle from this.
- **splash.png**: OpsFlux logo centered on #1e3a5f background. Keep logo in the safe zone (center 40%).
- **notification-icon.png**: Must be white silhouette on transparent background (Android requirement).

Generate with: `npx expo-optimize` after placing source images.
