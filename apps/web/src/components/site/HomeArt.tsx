/** Decorative arcs from one origin to several destinations (same motif as the map). */
export function HomeArt({ className = "" }: { className?: string }) {
  const dests: [number, number][] = [
    [40, 60],
    [60, 150],
    [250, 40],
    [330, 120],
    [170, 190],
  ];
  const origin: [number, number] = [190, 80];
  return (
    <svg
      aria-hidden
      viewBox="0 0 380 220"
      className={`text-accent ${className}`}
      role="presentation"
    >
      {dests.map(([x, y], i) => {
        const [ox, oy] = origin;
        const cx = (ox + x) / 2;
        const cy = Math.min(oy, y) - 38;
        return (
          <g key={i}>
            <path
              d={`M${ox} ${oy} Q${cx} ${cy} ${x} ${y}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeDasharray="3 4"
              opacity="0.75"
            />
            <circle cx={x} cy={y} r="5" fill="currentColor" />
          </g>
        );
      })}
      <circle cx={origin[0]} cy={origin[1]} r="6.5" fill="var(--origin)" />
    </svg>
  );
}
