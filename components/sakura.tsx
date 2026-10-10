// Cherry-blossom petals drifting down behind the page. Positions are fixed so server and client render the same markup.
const PETALS = [
  { left: 4, delay: 0, duration: 14, size: 16 },
  { left: 12, delay: 6, duration: 18, size: 12 },
  { left: 21, delay: 2.5, duration: 15, size: 18 },
  { left: 30, delay: 9, duration: 20, size: 11 },
  { left: 38, delay: 4, duration: 16, size: 14 },
  { left: 47, delay: 11, duration: 19, size: 17 },
  { left: 55, delay: 1.5, duration: 17, size: 12 },
  { left: 63, delay: 7.5, duration: 14, size: 15 },
  { left: 71, delay: 3, duration: 21, size: 13 },
  { left: 79, delay: 10, duration: 16, size: 18 },
  { left: 87, delay: 5, duration: 18, size: 12 },
  { left: 95, delay: 8.5, duration: 15, size: 16 }
];

export function Sakura() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {PETALS.map(({ left, delay, duration, size }) => (
        <svg
          key={left}
          className="sakura-petal"
          viewBox="0 0 20 20"
          width={size}
          height={size}
          style={{ left: `${left}%`, animationDelay: `${delay}s, ${delay}s`, animationDuration: `${duration}s, ${duration / 4}s` }}
        >
          <path d="M10 1 C15 4 18 10 10 19 C2 10 5 4 10 1 Z M10 1 L8.6 4 L10 3.4 L11.4 4 Z" fill="#ffb3d1" fillRule="evenodd" stroke="#ff8fb8" strokeWidth={0.8} />
        </svg>
      ))}
    </div>
  );
}
