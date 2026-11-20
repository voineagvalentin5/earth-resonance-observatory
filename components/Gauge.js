import React from 'react';

/**
 * Convert polar coordinates into cartesian. Used for drawing arcs.
 */
function polarToCartesian(cx, cy, radius, angleInDegrees) {
  const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  };
}

/**
 * Describe an SVG arc path between startAngle and endAngle.
 */
function describeArc(cx, cy, radius, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return [
    'M', start.x, start.y,
    'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y,
  ].join(' ');
}

/**
 * Gauge component draws a semi‑circular gauge with multiple colour
 * segments. The value prop is normalised between min and max to
 * calculate the end angle. Segment colors can be customised via the
 * segments prop, which should be an array of objects with keys:
 *  threshold (0‑1), color (tailwind colour string) and label.
 */
export default function Gauge({
  value = 0,
  min = 0,
  max = 100,
  segments = [
    { threshold: 0.25, color: 'neon-green' },
    { threshold: 0.5, color: 'neon-cyan' },
    { threshold: 0.75, color: 'neon-yellow' },
    { threshold: 1.0, color: 'neon-red' },
  ],
  unit = '',
  label,
}) {
  // normalised progress between 0 and 1
  const progress = Math.max(0, Math.min(1, (value - min) / (max - min)));
  // Determine colour based on segments
  const segment = segments.find(s => progress <= s.threshold) || segments[segments.length - 1];
  const colourClass = `text-${segment.color}`;
  // Inline CSS variable for dynamic glow
  const fillColor = `var(--tw-${segment.color})`;
  // For arcs, we subdivide the progress into segments and draw each separately
  const arcs = segments.map((s, i) => {
    const start = i === 0 ? 0 : segments[i - 1].threshold;
    const end = Math.min(s.threshold, progress);
    const angleStart = 180 * start;
    const angleEnd = 180 * end;
    const d = describeArc(50, 50, 45, angleStart, angleEnd);
    const tailwindColor = s.color;
    const strokeColor = `var(--tw-${tailwindColor})`;
    return (
      <path
        key={i}
        d={d}
        fill="none"
        stroke={strokeColor}
        strokeWidth="10"
        strokeLinecap="round"
        style={{ opacity: end > start ? 1 : 0.2 }}
      />
    );
  });
  return (
    <div className="flex flex-col items-center justify-center w-32">
      <svg width="100" height="60" viewBox="0 0 100 60">
        {/* Base arc background */}
        <path
          d={describeArc(50, 50, 45, 0, 180)}
          fill="none"
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth="10"
        />
        {arcs}
      </svg>
      <div className="text-center mt-1">
        <div
          className="text-lg font-semibold"
          style={{ color: fillColor, textShadow: `0 0 6px ${fillColor}` }}
        >
          {value.toFixed(1)}{unit}
        </div>
        <div className="text-xs uppercase text-neon-green opacity-80 tracking-widest">{label}</div>
      </div>
    </div>
  );
}