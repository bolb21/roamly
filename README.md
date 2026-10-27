# Roamly (prototype)

Front-end phone demo built with Expo + React Native + TypeScript. Mock data only — no backend.
See `CLAUDE.md` and `PRD.md` for the product brief.

## Run it on your phone (Expo Go)

1. Install **Expo Go** from the App Store / Play Store.
2. Make sure your phone and computer are on the **same Wi-Fi network**.
3. In a terminal in this folder:

   ```bash
   npm install        # first time only
   npx expo start
   ```

4. iPhone: open the Camera app and point it at the QR code in the terminal, then tap the banner.
   Android: open Expo Go and tap "Scan QR code".

If the phone can't connect (e.g. office/public Wi-Fi), stop the server and run `npx expo start --tunnel`.

Save any file and the app reloads on the phone. Shake the phone to open the dev menu.

## Checks

```bash
npx tsc --noEmit   # type check
npx expo lint      # lint
```

## Project layout

```
src/app/          Routes (Expo Router). _layout.tsx = app shell + tabs
src/screens/      Screen components (Visited, Social)
src/components/   Reusable UI (tabs, map controls, detail sheet, challenge bubble)
src/data/         Mock data (countries, challenge, demo user)
src/types/        Domain types (Country, Activity, Traveller, DailyChallenge)
src/theme/        Design tokens: colours, spacing, radii, typography
```

## What is real vs placeholder (current step: PRD step 2)

| Item | Status |
| --- | --- |
| Visited / Social tab switching | Working |
| Challenge speech bubble → challenge sheet | Working (mock data); bubble can be collapsed to the 🐒 badge |
| Visited-country count | Derived from the visited store; updates as countries are toggled |
| Globe | Real Skia globe (Natural Earth countries). Drag to rotate with momentum; pinch to zoom (1×–6×, rubber-band + haptic at the limits); two-finger twist. Tap a country to centre and highlight it and mark it visited/unvisited. See `docs/globe.md`. |
| Visited countries | Saved on the phone (AsyncStorage) and survive reloads. First launch starts from the mock list in `src/data/countries.ts`. |
| Zoom + / − buttons | Working |
| Globe / map / locate buttons | **Visual only**, no action yet |
| Social map | Placeholder panel |

Design adaptations from the reference image: points/XP/levels/stats cards and the five-item bottom bar removed; bell and avatar removed (not features); tagline changed from "Collect" to "Discover".
"Henry" and "Bangkok, Thailand" are mock values; the app never reads the device location.
