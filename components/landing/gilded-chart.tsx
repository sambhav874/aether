export function GildedChart({
  className,
  points,
  id,
}: {
  className?: string;
  points: string;
  id: string;
}) {
  const gradientId = `gilded-${id}`;
  const glowId = `gilded-glow-${id}`;

  return (
    <svg
      viewBox="0 0 400 140"
      fill="none"
      className={className}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="400" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#cc9166" />
          <stop offset="55%" stopColor="#e8c79a" />
          <stop offset="100%" stopColor="#fdf3e3" />
        </linearGradient>
        <linearGradient id={glowId} x1="0" y1="0" x2="0" y2="140" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#cc9166" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#cc9166" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,140 ${points} 400,140`} fill={`url(#${glowId})`} />
      <polyline
        points={points}
        stroke={`url(#${gradientId})`}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
