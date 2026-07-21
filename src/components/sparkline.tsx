import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Polygon, Polyline } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

/** Mali grafikon kretanja težine. Prilagođava se širini kartice. */
export function Sparkline({ values }: { values: number[] }) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const height = 88;
  const pad = 10;

  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = pad + (i * (width - 2 * pad)) / (values.length - 1);
    const y = height - pad - ((v - min) / span) * (height - 2 * pad);
    return [x, y] as const;
  });
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${pad},${height} ${line} ${width - pad},${height}`;
  const last = pts[pts.length - 1];

  return (
    <View style={{ marginTop: 8 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <Svg width={width} height={height}>
          <Polygon points={area} fill={t.accentSoft} opacity={0.7} />
          <Polyline
            points={line}
            fill="none"
            stroke={t.accent}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Circle cx={last[0]} cy={last[1]} r={4} fill={t.accent} />
        </Svg>
      )}
    </View>
  );
}
