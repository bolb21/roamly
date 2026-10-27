# Roamly — Claude Code Project Brief

## Product
Roamly (sometimes called globetrek but the name is to be confirmed) is a mobile travel app prototype. Its core experience is a stylised 3D globe for marking visited countries, transitioning into terrain-style exploration for activities, and a separate Social map for discovering mock travellers.

## Fixed stack
- React Native
- Expo
- TypeScript
- iOS and Android
- Front-end prototype only
- Mock/hardcoded data; no backend, accounts, payments, or bookings

## Current phase
Build a polished interactive phone demo for a solo developer with limited coding experience and a small budget. Prefer simple, maintainable implementations over complex infrastructure.

## Primary navigation
There are exactly two primary tabs:
1. Visited
2. Social

Visited opens by default and contains the globe and zoom-based To Do/activity exploration. To Do is not a third primary tab. Social has its own terrain/exploration-style map.

## Main behaviours
- Initial Visited view uses a stylised, cartoon-like 3D Earth.
- Countries have visited, unvisited, and mock current-location states.
- Selecting a country opens a detail sheet and allows its visited state to be toggled.
- Zooming in transitions towards a terrain/geographic map.
- Close-up exploration shows mock activity markers and activity detail sheets.
- Social displays fictional traveller markers on a terrain-style map.
- Tapping a traveller opens a mock profile.
- A compact daily-challenge speech bubble sits near the top-right of Home and opens challenge details.

## Visual direction
Use the user-provided GlobeTrek Night Explorer Dashboard image as the reference:
- Dark navy background
- Electric-blue and teal accents
- White, high-contrast text
- Rounded panels and circular map controls
- Prominent globe and clean map interactions

Adapt the reference to the agreed product:
- Remove points, XP, levels, badges, and leaderboards.
- Remove the old five-item bottom navigation.
- Replace the large challenge card with a compact speech bubble.
- Keep only Visited and Social as primary tabs.

## Architecture conventions
- Use TypeScript types for domain data.
- Keep mock data in separate modules from screen components.
- Use reusable components for tabs, map controls, detail sheets, and challenge UI.
- Keep transient UI state separate from domain data.
- Keep navigation and map rendering concerns separate.
- Centralise design tokens such as colours, spacing, typography, and radii.
- Use small components and straightforward naming.
- Avoid unnecessary dependencies and paid services.
- Follow the conventions of the existing project if already established.

Suggested structure, adapt to the existing repository:
- `src/screens/`
- `src/components/`
- `src/data/`
- `src/types/`
- `src/theme/`
- `src/navigation/`

## Map implementation
Test globe feasibility early. Do not assume a static image provides real rotation, country selection, or zoom.
Choose a practical implementation compatible with Expo and the budget. If the exact globe-to-terrain transition is too expensive, use a documented simulated transition that preserves the intended user experience.
Keep geographic data and map presentation decoupled.

## Mock data and privacy
- Use fictional traveller profiles.
- Treat locations and challenges as mock data.
- Never imply mock locations are live device locations.
- Do not request location permission for the demo unless explicitly approved.
- Keep data structures suitable for future backend integration.

## Out of scope
- Backend/database
- Authentication
- Real-time location sharing
- Real traveller discovery
- Real chat or connection requests
- Live activity/directions integrations
- Payments, bookings, or monetisation
- In-app AI features
- Points, XP, levels, badges, streaks, or leaderboards
- Production deployment

## Do not
- Add unapproved features or extra primary tabs.
- Reintroduce points, XP, levels, or leaderboard UI.
- Hardcode a real user's current location.
- present fictional profiles as real people.
- Build a backend before the prototype requires one.
- Add dependencies without checking compatibility with the Expo project.
- claim an interaction works if it is only a static visual.
- Start with map polish before validating the globe implementation.

## Delivery expectations
Implement in small, testable steps. Keep the app runnable after each step. Explain setup and run commands plainly, document technical compromises, and prioritise a reliable phone demo over production infrastructure.