// The night sky behind the globe: faint blue galaxy dust along a diagonal band with a
// soft glow, plain white stars, and a few bright stars with a halo. All still, and
// built once; drawn with points and gradients only (no blur), so it stays cheap even
// though the canvas redraws every frame while the globe moves. Look: theme
// `textureGlobeStyle.starfield` (reference: docs/design/stars-ref-1.jpeg).

import {
  Circle,
  Group,
  LinearGradient,
  Points,
  RadialGradient,
  Rect,
} from '@shopify/react-native-skia';
import { useState } from 'react';

import { textureGlobeStyle } from '@/theme';

const { starfield } = textureGlobeStyle;
/** Along the band, the glow is made of these soft blobs: position (0–1) and size. */
const GLOW_BLOBS = [
  { at: 0.2, size: 0.45 },
  { at: 0.5, size: 0.6 },
  { at: 0.8, size: 0.4 },
];

/** Repeatable pseudo-random number in [0, 1) for a given index. */
function random(i: number) {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Roughly bell-shaped random number in about [-1, 1], centred on 0. */
function bell(i: number) {
  return ((random(i) + random(i + 0.37) + random(i + 0.71)) / 3 - 0.5) * 2;
}

type Point = { x: number; y: number };

/** Everything the sky draws, worked out once for a canvas size. */
function buildSky(width: number, height: number) {
  const { band, dust, stars, bright } = starfield;
  const from = { x: band.from[0] * width, y: band.from[1] * height };
  const to = { x: band.to[0] * width, y: band.to[1] * height };
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  // Unit vectors along and across the band.
  const along = { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
  const across = { x: -along.y, y: along.x };
  const bandWidth = band.width * Math.hypot(width, height);

  // Dust, grouped by size and opacity so each group is one Points draw.
  const groups = dust.sizes.flatMap((size) =>
    dust.opacities.map((opacity) => ({ size, opacity, points: [] as Point[] })),
  );
  for (let i = 0; i < dust.count; i++) {
    const seed = 5000 + i * 7;
    let point: Point;
    if (random(seed) < dust.inBand) {
      const t = random(seed + 1) * length;
      const off = bell(seed + 2) * bandWidth;
      point = {
        x: from.x + along.x * t + across.x * off,
        y: from.y + along.y * t + across.y * off,
      };
    } else {
      point = { x: random(seed + 3) * width, y: random(seed + 4) * height };
    }
    // Most specks small and faint; a few bigger or brighter.
    const s = Math.min(
      dust.sizes.length - 1,
      Math.floor(random(seed + 5) ** 2 * dust.sizes.length),
    );
    const o = Math.min(
      dust.opacities.length - 1,
      Math.floor(random(seed + 6) ** 1.5 * dust.opacities.length),
    );
    groups[s * dust.opacities.length + o].points.push(point);
  }

  const starLayers = stars.map((layer, l) => ({
    ...layer,
    points: Array.from({ length: layer.count }, (_, i) => ({
      x: random(l * 1000 + i * 2) * width,
      y: random(l * 1000 + i * 2 + 1) * height,
    })),
  }));

  const brightStars = Array.from({ length: bright.count }, (_, i) => ({
    x: random(9000 + i * 2) * width,
    y: random(9001 + i * 2) * height,
  }));

  const glow = GLOW_BLOBS.map(({ at, size }) => ({
    centre: { x: from.x + along.x * at * length, y: from.y + along.y * at * length },
    radius: (size * length) / 2,
  }));
  const angle = Math.atan2(along.y, along.x);

  return {
    dustGroups: groups.filter((g) => g.points.length > 0),
    starLayers,
    brightStars,
    glow,
    angle,
  };
}

/** A still night sky across the canvas (drawn behind the globe). */
export function Starfield({ width, height }: { width: number; height: number }) {
  const [sky] = useState(() => buildSky(width, height));
  const fade = Math.min(0.45, starfield.edgeFade / height);
  const { bright, dust, glow } = starfield;
  return (
    <Group layer>
      {/* Soft glow along the galaxy band: round gradients squashed into long ovals */}
      {sky.glow.map((blob, i) => (
        <Group
          key={`glow${i}`}
          transform={[
            { translateX: blob.centre.x },
            { translateY: blob.centre.y },
            { rotate: sky.angle },
            { scaleY: glow.thickness },
          ]}>
          <Circle cx={0} cy={0} r={blob.radius}>
            <RadialGradient
              c={{ x: 0, y: 0 }}
              r={blob.radius}
              colors={[glow.color, 'transparent']}
            />
          </Circle>
        </Group>
      ))}

      {/* Galaxy dust */}
      {sky.dustGroups.map((group) => (
        <Points
          key={`dust${group.size}-${group.opacity}`}
          points={group.points}
          mode="points"
          color={dust.color}
          opacity={group.opacity}
          strokeWidth={group.size}
          strokeCap="round"
        />
      ))}

      {/* Plain stars */}
      {sky.starLayers.map((layer) => (
        <Points
          key={`stars${layer.size}`}
          points={layer.points}
          mode="points"
          color="white"
          opacity={layer.opacity}
          strokeWidth={layer.size}
          strokeCap="round"
        />
      ))}

      {/* Bright stars with a halo */}
      {sky.brightStars.map((c, i) => (
        <Group key={`bright${i}`}>
          <Circle c={c} r={bright.halo}>
            <RadialGradient c={c} r={bright.halo} colors={[bright.haloColor, 'transparent']} />
          </Circle>
          <Circle c={c} r={bright.core} color={bright.color} />
        </Group>
      ))}

      {/* Fades the sky out towards the top and bottom edges */}
      <Rect x={0} y={0} width={width} height={height} blendMode="dstIn">
        <LinearGradient
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: height }}
          colors={['transparent', 'white', 'white', 'transparent']}
          positions={[0, fade, 1 - fade, 1]}
        />
      </Rect>
    </Group>
  );
}
