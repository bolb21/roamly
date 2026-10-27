# PRD.md — Roamly Mobile Prototype

## 1. Product summary and vision

Roamly (sometimes called globetrek but the name is to be confirmed) is a travel app built around an interactive globe and map, allowing users to mark countries they have visited and explore activities in the places they are interested in. A separate Social tab lets users discover other travellers in an area. A compact, contextual daily-challenge speech bubble provides a way to discover a local challenge without dominating the home screen.

The first deliverable is a polished, interactive front-end prototype for demonstration on an iOS or Android phone. It uses mock data and local UI state, with no production backend.

## 2. Target users and problem solved

### Target users

The exact launch audience has not been confirmed.

ASSUMPTION: The initial prototype should be understandable to general travellers, including people travelling independently and younger travellers.

### Problems addressed

- Users want a visual way to record which countries they have visited.
- Users want to explore destinations at progressively closer map scales and discover activities in an area.
- Users may want to discover other travellers nearby.
- Users want to see a relevant local challenge without navigating through a large separate dashboard.

## 3. Core user journey

1. The user opens the app and sees the Home screen.
2. The default view displays a stylised 3D globe on a dark navy background.
3. The user rotates or zooms the globe and taps a country to inspect it or change its visited status.
4. As the user zooms in, the map experience transitions from the stylised globe to a more geographically detailed terrain/map view.
5. At closer zoom levels, the user can discover mock activities and attractions relevant to the visible area.
6. The user switches to the Social tab to explore a terrain-style map containing mock profiles of travellers who are visible in the area.
7. The user taps the compact local-challenge speech bubble to view a daily challenge relevant to the current area.
8. The user can interact with prototype detail sheets and controls backed by mock data.

The prototype does not require real location access, accounts, live messaging, or a backend.

## 4. Features

### 4.1 MVP for the phone demo

#### A. Home and navigation

Description:
- Provide two primary tabs:
  1. Visited — the country-tracking globe.
  2. Social — the traveller-discovery map.
- The Home screen opens on the Visited view.
- To Do is a map exploration mode within the Visited experience, not a third primary tab.

Acceptance criteria:
- The app opens directly to the Visited screen.
- Users can switch between Visited and Social.
- The selected tab is visually distinct.
- Navigation works on a phone-sized viewport.
- The design does not include the old five-item bottom navigation from the reference image.

#### B. Stylised 3D globe and visited countries

Description:
- The primary Visited screen centres on a stylised, cartoon-like 3D Earth.
- Countries have visually distinct visited, current-location, and not-visited states.
- Users can inspect a country and toggle its visited status.
- Provide mock country data.

Acceptance criteria:
- The globe is the dominant element of the initial screen.
- The UI clearly distinguishes visited and unvisited countries.
- A selected country can be identified by name.
- Tapping a country opens a detail sheet or equivalent control.
- The detail sheet shows its name and visited status.
- The user can toggle visited status and see the globe update.
- Any displayed visited-country count is derived from local state.
- No points, experience, levels, badges, or leaderboards are displayed.

Implementation note:
The globe implementation must be tested early. Do not assume that a static globe image provides working country selection, rotation, or zoom. If a fully interactive globe is not practical with the chosen library, document the limitation and implement the closest viable interactive prototype.

#### C. Globe-to-terrain map transition

Description:
- Zooming in moves the user from the stylised cartoon globe towards a geographically detailed terrain/map view.
- The close-up view provides the foundation for activity discovery.
- The Social tab also uses a terrain/exploration-style map rather than the cartoon globe.

Acceptance criteria:
- The initial Visited view uses the stylised globe.
- The map representation changes to a terrain-style view at closer zoom levels.
- At the closest prototype zoom level, the user can see mock activity markers.
- The Social view uses the terrain-style map.
- Map controls and navigation remain usable on a phone.
- The implementation clearly separates the visual map presentation from mock country and activity data.

ASSUMPTION:
The prototype may use a simulated transition between map representations if a continuous, technically accurate globe-to-terrain transition is too expensive for Phase 1. The transition should feel coherent and preserve the user's selected area where feasible.

#### D. To Do / activity discovery

Description:
- To Do is an exploration mode available when zooming into the Visited map.
- It displays activities and attractions in the selected area.
- Users can tap a marker to inspect an activity.
- Mock activity data is sufficient for the prototype.

Acceptance criteria:
- Close-up map views can display activity markers.
- Tapping a marker opens an activity detail sheet.
- The detail sheet displays a name, short description, location, and image where available.
- The detail sheet includes a visible way to close it and return to the map.
- Directions may be represented by a mock action or placeholder; real navigation integration is not required.
- Saving activities is not a confirmed requirement for the initial prototype and should not be implemented unless agreed.

#### E. Social map

Description:
- The Social tab displays a terrain/exploration-style map.
- Mock traveller markers appear in selected areas.
- Selecting a marker opens a mock traveller profile.

Acceptance criteria:
- Social is a separate primary tab.
- Its map uses the terrain/exploration visual style.
- Traveller markers are visually distinct from activity markers.
- Tapping a traveller marker opens a profile detail sheet.
- Profiles use clearly fictional mock data.
- The prototype does not claim that mock profiles are real or actually nearby.
- Real chat, account creation, connection requests, and live location are out of scope for this phase unless separately approved.

#### F. Local daily-challenge speech bubble

Description:
- A compact speech bubble sits near the top-right of the Home/Visited screen.
- It invites the user to open a daily challenge relevant to the current area.
- It must not obstruct the globe or make the Home screen feel crowded.
- It replaces the large challenge card shown in the reference image.

Suggested copy:
"Hey Henry, looks like you're in Bangkok, Thailand! Tap to see today's local challenge."

Use the name and location as mock values, not as hardcoded assumptions about a real user's identity or current location.

Acceptance criteria:
- The bubble is visibly attached to or associated with a small contextual UI element near the top-right.
- Its text wraps within a compact area.
- It does not cover a substantial part of the globe or block essential controls.
- Tapping it opens a challenge detail sheet or screen.
- Challenge content comes from mock data.
- The challenge can describe an activity or place in the selected area.
- No XP rewards, points, leaderboards, streaks, or levelling mechanics are included.
- If no location is available, show a generic location-neutral challenge prompt rather than claiming to know the user's location.

### 4.2 Phase 2

These capabilities are potential follow-up work, not requirements for the current demo.

#### A. Real geographic data
- Replace mock country and place information with suitable geographic data.
- Support accurate country selection and geographic map transitions.
- Acceptance criteria: country selection and map features use verified geographic data rather than manually positioned demo-only markers.

#### B. Real location
- Request device location permission only when needed.
- Use the current location to contextualise local challenges and nearby map content.
- Provide a sensible fallback if permission is denied.
- Acceptance criteria: the app never presents a mock location as verified live device location.

#### C. Backend and accounts
- Introduce accounts, persisted user profiles, and server-side visited-country data if product requirements justify them.
- Acceptance criteria: user data can be retrieved across sessions and devices.

#### D. Social functionality
- Consider opt-in traveller visibility, connection requests, and messaging.
- Define location precision, consent, blocking, reporting, and safety behaviours before releasing real social discovery.
- Acceptance criteria: visibility is explicit and user-controlled, and users have a way to stop being discoverable.

#### E. Real activity and directions data
- Integrate a suitable place-data source and real directions provider.
- Determine available transport modes by provider and region.
- Acceptance criteria: displayed directions and activity details originate from the integrated provider.

### 4.3 Later

No commitment has been made to the following:
- Monetisation, subscriptions, advertising, or commissions.
- A production release or app-store launch.
- Advanced social feeds or community systems.
- Additional gamification systems.
- AI-powered features inside the app.

These should remain out of implementation until product decisions are made.

## 5. Screen-by-screen breakdown

### 5.1 Visited / Home screen

Purpose:
Provide the main globe-based interface for recording visited countries and beginning geographic exploration.

Key UI:
- Compact app header.
- Stylised 3D globe.
- Clear visited/unvisited country visual states.
- Current-location indicator when represented by mock data.
- Compact zoom and map controls.
- Compact local-challenge speech bubble near the top-right.
- Two-tab primary navigation: Visited and Social.
- Optional compact visited-country count, provided it does not clutter the screen.

Interactions:
- Rotate globe if supported by the selected implementation.
- Zoom in and out.
- Tap a country to inspect it.
- Toggle a country's visited status.
- Transition into closer terrain/map views.
- Tap the challenge bubble to open challenge details.
- Switch to Social.

Navigation:
- Visited is the default tab.
- Close-up exploration remains within the Visited experience.
- The Social tab opens a separate terrain-map view.

### 5.2 Country detail sheet

Purpose:
Display and edit the visited state for a selected country.

Key UI:
- Country name.
- Current visited state.
- Toggle/action to mark visited or not visited.
- Close control.

Interactions:
- Change visited state.
- Close the sheet and return to the map.
- Reflect the updated state on the globe and visited count.

### 5.3 Close-up exploration / To Do mode

Purpose:
Show activities and attractions for the selected geographic area.

Key UI:
- Terrain/exploration-style map.
- Mock activity markers.
- Compact map controls.
- Activity detail sheet when a marker is selected.

Interactions:
- Zoom and pan where supported.
- Select an activity marker.
- Open and close activity details.
- Display a mock directions action if useful for demonstrating the flow.

Navigation:
- Reached by zooming into the Visited globe.
- Not a third primary tab.

### 5.4 Activity detail sheet

Purpose:
Show information about a selected attraction or activity.

Key UI:
- Activity name.
- Image placeholder or bundled image.
- Short description.
- Location label.
- Optional mock directions action.

Interactions:
- Open from an activity marker.
- Close to return to the map.

### 5.5 Social screen

Purpose:
Let the user explore a map of mock travellers.

Key UI:
- Terrain/exploration-style map.
- Mock traveller markers.
- Two-tab primary navigation.
- Traveller detail sheet.

Interactions:
- Pan or zoom where supported.
- Tap a traveller marker.
- Open and close a mock profile.
- Do not expose real user locations.

### 5.6 Traveller detail sheet

Purpose:
Show a fictional traveller profile selected from the Social map.

Key UI:
- Fictional name.
- Mock profile image or placeholder.
- Small amount of sample profile information.

Interactions:
- Open from a traveller marker.
- Close to return to Social.

Real connection requests and chat are not required for the first prototype.

### 5.7 Daily challenge detail

Purpose:
Explain the local challenge opened from the Home speech bubble.

Key UI:
- Challenge title.
- Short description.
- Associated location or image when available.
- Close control.
- Optional action to view the associated place on the map.

Interactions:
- Open from the speech bubble.
- Close to return to the previous screen.
- Any location-specific wording must use mock data unless actual device location has been explicitly implemented.

## 6. UI/UX direction

### Visual reference

Use the user-provided GlobeTrek Night Explorer Dashboard image as the primary visual reference.

Retain:
- Dark navy background.
- Electric-blue outlines and highlights.
- Blue/teal accent colours.
- High-contrast white text.
- Rounded panels and circular map controls.
- A polished, luminous travel-interface aesthetic.
- A prominent, stylised 3D globe on the Visited screen.

### Required changes from the reference image

Remove:
- Total Points.
- XP rewards.
- Current Level.
- Leaderboards or level progression.
- The five-item bottom navigation.
- The large Daily Challenge card.
- Any assumption that gamification is a core product loop.

Replace with:
- Two primary tabs: Visited and Social.
- The To Do experience inside the zoomable Visited map.
- A small contextual daily-challenge speech bubble near the top-right of the Home screen.

### Map visual behaviour

- Initial Visited view: stylised, cartoon-like 3D Earth.
- Zoomed Visited view: terrain/geographic map presentation.
- Close-up Visited view: terrain map with activity markers.
- Social view: terrain/exploration map with traveller markers.

### Layout principles

- The globe remains the dominant element on the initial Visited screen.
- The challenge bubble must remain small and must not obscure the primary globe interaction.
- Use phone-safe spacing and respect device safe areas.
- Use readable text sizes and clear tap targets.
- Use reusable colours, spacing, typography, radii, and control styles.
- Avoid adding dashboard cards or decorative metrics not required by the agreed experience.

Exact font family, colour hex codes, animation timing, and final globe implementation are not yet specified. Derive them from the supplied reference where practical and document any technical compromises.

## 7. AI features

No in-app AI feature has been agreed.

For Phase 1:
- Do not implement an AI chatbot.
- Do not implement AI trip planning.
- Do not generate live recommendations using an AI service.
- Use predefined mock challenges and activity data.

AI coding assistance is part of the development workflow, not a feature in the product.

## 8. Data model

Use TypeScript types and mock data modules so the front end can later be connected to real providers or a backend.

### Country

- id: string
- name: string
- visited: boolean
- isCurrentLocation: boolean

The current-location field must be treated as mock state in Phase 1.

### Activity

- id: string
- name: string
- description: string
- countryId: string
- areaLabel: string
- latitude: number | null
- longitude: number | null
- image: string | null

Coordinates may be mock coordinates. If the prototype does not use a real geographic map, marker positions may instead be represented by a documented demo-specific positioning model.

### Traveller

- id: string
- displayName: string
- profileImage: string | null
- areaLabel: string
- latitude: number | null
- longitude: number | null

All traveller data is fictional and must not be presented as real user data.

### DailyChallenge

- id: string
- title: string
- description: string
- areaLabel: string | null
- image: string | null
- activityId: string | null

### UI state

Keep transient interface state separate from mock domain data. It may include:
- selected primary tab
- selected country
- selected activity
- selected traveller
- selected challenge
- map zoom level
- map representation
- map centre or selected area
- locally edited visited-country state

Do not add XP, points, level, leaderboard, payment, booking, account, or chat entities.

## 9. Out of scope for now

- Real backend and database.
- Authentication and account creation.
- Real-time location sharing.
- Real traveller discovery.
- Real chat or connection requests.
- Real public transport or navigation integrations.
- Booking or payment functionality.
- Monetisation.
- Points, XP, levels, leaderboards, badges, and streaks.
- In-app AI features.
- Production-ready moderation infrastructure.
- Production deployment or app-store submission.

## 10. Open questions and assumptions

### Open questions

1. What is the confirmed primary launch audience?
2. Which globe/map library will support the required interaction within the budget?
3. Can the prototype provide a genuinely interactive globe-to-terrain transition, or must the transition be simulated?
4. Should the prototype use device location permission, or use mock location only?
5. Should visited-country changes persist after closing and reopening the app?
6. Should the prototype include real or simulated map tiles?
7. Should activity detail sheets include a Save action?
8. Should the challenge include a completion action or photo submission?
9. Should the Social prototype include mock connection and chat flows?
10. What location precision and privacy controls will be required before real social functionality is released?
11. Which fonts and exact colour values should be used?
12. What is the final target for testing: Expo Go, a development build, or both?
13. What monetisation model, if any, should eventually be considered?

### Assumptions

- The initial audience can be represented by general traveller use cases until the target market is confirmed.
- The initial screen opens directly to Visited without mandatory onboarding.
- Mock data is enough to demonstrate the core interactions.
- A shared map-exploration model is preferred: Visited begins as a stylised globe, while Social uses a terrain-style map.
- The challenge speech bubble is contextual and compact; it is not a large card.
- No user profile, notifications, or header control is required beyond what is necessary to reproduce the reference's visual style.
- Local UI state is sufficient for the first demonstration.
- The two primary tabs replace the original three top tabs and five-item bottom navigation.

## 11. Suggested build order

Each step should run on a phone before proceeding to the next.

### Step 1 — Project foundation
- Set up Expo, React Native, and TypeScript.
- Confirm the project launches on the target phone.
- Establish shared layout, safe-area, colour, typography, and spacing conventions.

Acceptance: The empty app launches without errors on the target device.

### Step 2 — Static Visited screen
- Build the header.
- Reproduce the dark navy visual direction.
- Add the two-tab navigation.
- Establish the globe's intended display area.
- Add the compact challenge bubble.

Acceptance: The screen resembles the supplied reference while excluding points, XP, levels, and the old navigation.

### Step 3 — Globe feasibility spike
- Test the candidate globe/map implementation.
- Verify whether rotation, zoom, country interaction, and representation changes are practical.
- Document the chosen approach before investing in dependent screens.

Acceptance: A working technical demonstration proves the selected approach or clearly documents the fallback.

### Step 4 — Country selection
- Add mock country data.
- Implement country selection and the detail sheet.
- Toggle visited state.
- Derive the visited count from state if displayed.

Acceptance: Toggling a country updates its displayed state consistently.

### Step 5 — Zoomed terrain exploration
- Add the zoomed map representation.
- Implement a coherent transition from the stylised globe.
- Add mock activity markers at close zoom levels.

Acceptance: Users can reach a map view containing selectable activity markers.

### Step 6 — Activity details
- Build the activity detail sheet.
- Connect it to mock activity data.
- Add only the agreed prototype actions.

Acceptance: Tapping an activity marker opens the correct details and can return to the map.

### Step 7 — Social map
- Implement the separate Social tab.
- Display a terrain-style map and fictional traveller markers.
- Add the traveller detail sheet.

Acceptance: Users can switch between Visited and Social and inspect mock travellers.

### Step 8 — Challenge flow
- Wire the challenge bubble to a challenge detail sheet.
- Use mock area-specific text and content.
- Include a sensible generic fallback.

Acceptance: The challenge opens from the compact bubble without obstructing the Home screen.

### Step 9 — Interaction and layout polish
- Test small phone screens and safe areas.
- Check tab switching, sheet dismissal, map controls, and text wrapping.
- Remove accidental references to points or leaderboard mechanics.

Acceptance: The core demo flows can be completed without crashes or blocked controls.

### Step 10 — Demo validation
- Run the app on the target phone.
- Check startup, interaction stability, and visual consistency.
- Document any mocked or simulated behaviours so the demo is not mistaken for production functionality.

Acceptance: The prototype reliably demonstrates the agreed core journey on a phone.
