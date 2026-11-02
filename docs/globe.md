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
## Visual polish

All colours, sizes and effect strengths live in `globeStyle` in `src/theme/index.ts`
(shared with the future map view).

**Checking a look without a phone:** the same Skia tree can be rendered headlessly in
Node with `@shopify/react-native-skia/lib/commonjs/headless` and `canvaskit-wasm`
(the real Skia engine), then viewed as a PNG.

**No adaptive quality:** every effect is always drawn, moving or not, so what you see
while spinning is what you see at rest.

### What's drawn, bottom to top

Light comes from the top-left of the screen.

| Layer | How | Cost per frame |
| --- | --- | --- |
| Backdrop spotlight, atmosphere halo, ocean | Radial gradients | ~3 gradient fills |
| **Land layer** | Grey tops (top-to-bottom gradient), green visited tops and the fading country, drawn into one layer. The layer's image filter adds, underneath: two blurred tinted copies (shallow-water glow) and `slab.steps` darkened copies shifted down-right (the raised sides). Clipped to the sphere | 3 path fills + GPU filter passes (no extra path work) |
| Borders, lit edges | Land path stroked; again 1 px up-left in faint white; visited border in green | 3 strokes |
| Shading, rim shadow, rim light, rim line | Gradients over the sphere | ~4 gradient fills |

**Sides are darkened copies of the tops**, so grey land gets a dark grey side and green
land a dark green one (`slab.shade`). Because the tops are drawn last in the layer, the
sides only show over the sea; they never cover a neighbouring country.

**Land texture was tried three ways and dropped.** A noise overlay is in screen space
(it stays put while the land slides under it, like a dirty screen). Hand-drawn marks
(hills, mountains, waves) stamped with a Skia `Atlas` at fixed lat/lon points did stick
to the globe, but looked poor at this size. Keeping them in step with the land meant
handing ~500 transforms to Skia every frame, which dropped fps into the 20s. Lessons
kept for any future attempt:
- `useRSXformBuffer`'s mapper declares no outputs, so Reanimated can run Skia's redraw
  before it and the stamps lag the land by a frame.
- A zero-size atlas transform makes Skia stop drawing every sprite after it.

**Paths are parsed once per frame.** The projection builds SVG strings; each is turned
into an `SkPath` in its derived value and shared by every layer that draws it. Passing a
string to `<Path>` makes Skia's native recorder re-parse it for each layer every frame.

**Why the earlier version was slow when partly zoomed in:** every side copy and the two
wide shallow-water strokes were separate path draws, and Skia re-triangulates a path
each time it's drawn. With the detailed outlines on screen that was ~15 large path draws
per frame. The layer filter replaces them with image passes on the GPU.

Making visited countries taller was tried twice (deeper sides spilled over neighbours;
lifted tops looked janky) and dropped.

## Flat map

The map button on the Visited screen switches to a flat world map
(`src/components/map/WorldMap.tsx`). Both views stay mounted and stacked, so each keeps
its position; the hidden one is transparent and ignores touches (an idle Skia canvas
doesn't redraw, so it costs little). Don't hide a Skia canvas with `display: 'none'`: it
loses its drawing and comes back blank, because nothing triggers a redraw.

| Concern | Choice |
| --- | --- |
| Projection | d3-geo Natural Earth (`src/globe/flatMap.ts`), the rounded atlas-style world map. Antarctica stays a sensible size |
| Outlines | Built once on the JS thread with `geoPath` and parsed into Skia paths once. Moving and zooming only change one transform, so nothing is rebuilt per frame |
| Look | Same theme and land layer as the globe (`landLayer.ts`): raised sides, shallow-water glow, borders, lit edges, green visited countries. Map-only colours are in `globeStyle.map` |
| View | Zoom 1 = whole world fits the width (`MAP_ZOOM` 1–12); it opens zoomed to fill the height. The view is the map point at the screen's middle, clamped so the map always covers the screen |
| Gestures | Drag with momentum, pinch about the fingers, tap to select (slides the country to the middle) |
| Tapping | Screen → map units → `projection.invert` → lon/lat → the same `countryAt` as the globe, with map units per radian × zoom as the scale |

The land layer's filter has to work in screen px, so inside the map transform the layer
sits in a group that undoes the transform, and the land tops inside it re-apply it.
Side copies grow with depth (at most 1.25 px apart) so deep sides don't look stepped.

Not done yet: horizontal wrap-around (the map stops at ±180°), the mock current
location, and activity markers.
