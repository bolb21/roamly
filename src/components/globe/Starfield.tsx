// The night sky behind the globe: faint blue galaxy dust in soft, patchy clouds spread
// over the sky, plain white stars, and a few bright stars with a halo. All still, and
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

type Cloud = {
  centre: Point;
  /** Half its length, px. */
  radius: number;
  /** Direction of its length (radians), and thickness compared with length. */
  angle: number;
  stretch: number;
  color: string;
};

/** Everything the sky draws, worked out once for a canvas size. */
function buildSky(width: number, height: number) {
  const { clouds: layout, dust, stars, bright, glow } = starfield;
  const diagonal = Math.hypot(width, height);

  // Dust clouds, one per grid cell (jittered), so they're spread over the whole sky.
  const clouds: Cloud[] = Array.from({ length: layout.count }, (_, i) => {
    const seed = 7000 + i * 11;
    const column = i % layout.columns;
    const row = Math.floor(i / layout.columns) % layout.rows;
    const size = layout.sizes[0] + random(seed + 2) * (layout.sizes[1] - layout.sizes[0]);
    return {
      centre: {
        x: ((column + 0.15 + random(seed) * 0.7) / layout.columns) * width,
        y: ((row + 0.15 + random(seed + 1) * 0.7) / layout.rows) * height,
      },
      radius: (size * diagonal) / 2,
      angle: random(seed + 3) * Math.PI,
      stretch: layout.stretch[0] + random(seed + 4) * (layout.stretch[1] - layout.stretch[0]),
      color: glow[i % glow.length],
    };
  });

  // Dust, grouped by size and opacity so each group is one Points draw.
  const groups = dust.sizes.flatMap((size) =>
    dust.opacities.map((opacity) => ({ size, opacity, points: [] as Point[] })),
  );
  for (let i = 0; i < dust.count; i++) {
    const seed = 5000 + i * 7;
    let point: Point;
    if (random(seed) < dust.inClouds) {
      // Denser towards a cloud's middle.
      const cloud = clouds[Math.floor(random(seed + 1) * clouds.length)];
      const along = bell(seed + 2) * cloud.radius;
      const across = bell(seed + 3) * cloud.radius * cloud.stretch;
      const cos = Math.cos(cloud.angle);
      const sin = Math.sin(cloud.angle);
      point = {
        x: cloud.centre.x + along * cos - across * sin,
        y: cloud.centre.y + along * sin + across * cos,
      };
    } else {
      point = { x: random(seed + 4) * width, y: random(seed + 5) * height };
    }
    // Most specks small and faint; a few bigger or brighter.
    const s = Math.min(
      dust.sizes.length - 1,
      Math.floor(random(seed + 6) ** 2 * dust.sizes.length),
    );
    const o = Math.min(
      dust.opacities.length - 1,
      Math.floor(random(seed + 7) ** 1.5 * dust.opacities.length),
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

  return {
    dustGroups: groups.filter((g) => g.points.length > 0),
    starLayers,
    brightStars,
    clouds,
  };
}

/** A still night sky across the canvas (drawn behind the globe). */
export function Starfield({ width, height }: { width: number; height: number }) {
  const [sky] = useState(() => buildSky(width, height));
  const fade = Math.min(0.45, starfield.edgeFade / height);
  const { bright, dust } = starfield;
  return (
    <Group layer>
      {/* Soft glow in each dust cloud: round gradients squashed into ovals */}
      {sky.clouds.map((cloud, i) => (
        <Group
          key={`glow${i}`}
          transform={[
            { translateX: cloud.centre.x },
            { translateY: cloud.centre.y },
            { rotate: cloud.angle },
            { scaleY: cloud.stretch },
          ]}>
          <Circle cx={0} cy={0} r={cloud.radius}>
            <RadialGradient
              c={{ x: 0, y: 0 }}
              r={cloud.radius}
              colors={[cloud.color, 'transparent']}
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
