# Globe implementation notes

## Approach

| Concern | Choice |
| --- | --- |
| Drawing | `@shopify/react-native-skia` (included in Expo Go) |
| Country data | Natural Earth 1:110m via `world-atlas/countries-110m.json` (177 countries) |
| Preprocessing | `topojson-client` → GeoJSON, `topojson-simplify` for a lighter copy, `d3-geo` for centroids (and hit-testing from milestone 3) |
| Projection | Orthographic, hand-written as a Reanimated **worklet** (`src/globe/projection.ts`) |
| Orientation | Unit quaternion (`src/globe/rotation.ts`). No up-lock: spins freely over the poles and upside down |
| Gestures | `react-native-gesture-handler` v3 hooks; callbacks run on the UI thread. Trackball drag: axis in the screen plane perpendicular to the finger, angle = distance / radius |
| Momentum | Reanimated `withDecay` on a "spin distance", applied as continued trackball drag along the release direction |

The renderer uses the quaternion's rotation matrix directly. It doesn't convert to
d3-geo rotate angles, which would bring back gimbal problems near the poles.

### Why the projection isn't d3-geo's `geoOrthographic`

d3-geo isn't written as worklets, so calling it every frame would mean running it on
the JS thread and sending the path across, which is the usual source of jank. Instead
d3-geo does the one-off work at startup, and a small custom orthographic projection
runs on the UI thread each frame:

1. Each border point is precomputed as a 3D unit vector.
2. Each frame: rotate by the view centre (lon/lat), skip rings whose bounding cap is
   wholly on the far side, clip rings at the horizon, and close the gap with an arc
   along the globe edge.
3. Emit one SVG path string; Skia parses and draws it in a single native call.

## Performance measurements (milestone 1)

Measured in Node on a desktop CPU. `--jitless` disables the JIT and gives a rough
proxy for Hermes on the phone, which also has no JIT. Phone figures will differ;
read them from the on-device overlay (see below).

| Version | Points | JIT ms/frame | Interpreter ms/frame |
| --- | --- | --- | --- |
| First version (decimal coords, absolute `L`) | 12,034 | 2.96 | 9.34 |
| Integer quarter-pixel coords, relative `l` | 12,034 | 1.26 | 4.97 |
| + shared-border simplification, 5° densify | 5,487 | 0.77 | **2.47** |
| Full detail (for zoomed-in views, milestone 2) | 10,308 | 1.13 | 4.53 |

The budget is 16.7 ms per frame at 60 fps, and Skia's drawing has to fit inside it too.

### On-device overlay

While `SHOW_PERF` is on, the globe shows a small green readout:
`fps · path ms`. **fps** is the UI-thread frame rate and **path** is the average time
spent building the globe path each frame. Turn it off with `SHOW_PERF` in
`src/components/globe/Globe.tsx`.

Expo Go runs a development JS bundle, which is slower than a release build. For
realistic numbers run `npx expo start --no-dev --minify`.

## Zoom (milestone 2)

- Zoom multiplies the globe radius (`src/globe/zoom.ts`): 1× to 6×. Pinching past a
  limit rubber-bands, gives a light haptic (`expo-haptics`), and springs back on release.
- The point between the fingers stays put while pinching (the globe rotates to compensate).
- Two-finger twist rolls the globe about the line of sight. Drag, pinch and twist all run
  at once.
- From 2× up the globe draws the full-detail outlines instead of the simplified copy.
- Rings wholly outside the canvas are skipped, so zoomed in is cheaper, not dearer:

| Zoom | Outlines | JIT ms/frame | Interpreter ms/frame |
| --- | --- | --- | --- |
| 1× | simplified | 0.38 | 1.69 |
| 2× | detailed | 0.40 | 2.03 |
| 6× | detailed | 0.13 | 0.71 |

- The outer glow fades out by 1.6× (it's off-screen by then, and a large blur is costly).

## Selection and visited state (milestone 3)

- **Tap → country:** the tap worklet undoes the projection (screen point → point on the
  sphere, using the current orientation and zoom) and sends lon/lat to the JS thread,
  where `src/globe/hitTest.ts` uses d3-geo's spherical point-in-polygon. Under 1 ms per
  tap. Antimeridian countries (Russia, Fiji) work because the test is spherical.
- **Generous targets:** every country can be hit within 10 px of its anchor (so Luxembourg
  is tappable at full-globe size), and taps up to 8 px off a coast pick that country.
  Tapping open ocean or off the globe deselects.
- **Anchor:** each country's anchor is the centroid of its largest polygon, so France
  centres on France rather than between it and French Guiana.
- **Centring:** the globe slerps to the smallest rotation that brings the anchor to the
  front (it keeps the user's twist; it doesn't force north up). Any touch cancels it.
- **Visited:** one store (`src/state/visitedCountries.tsx`) holds the visited ids, saved
  with AsyncStorage. The globe draws all visited countries as one green path; the country
  being toggled is drawn on its own with an animated grey ↔ green colour.

## Known compromises

- At full-globe size small neighbours win taps near their borders (e.g. Paris picks
  Belgium at 1×, France when zoomed in). Zoom in for precise picks.
- The selected country stays highlighted when the user drags away, but the globe doesn't
  stop them dragging it off-centre. The name bubble follows the country and hides when
  it turns away.
- Visited state isn't shown for the mock current location (Thailand) yet.

- Natural Earth 1:110m is coarse; at 6× coastlines look angular. The terrain map
  (PRD step 5) takes over for closer views.

- Countries cut at the ±180° antimeridian (eastern Russia, Fiji) show a faint border
  line along the cut.
- Polygon holes are drawn with even-odd fill.
- Low-detail geometry: tiny islands and microstates may be missing or very small. This
  matters for tapping in milestone 3.
