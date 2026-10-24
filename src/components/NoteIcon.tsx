import type { Duration } from '../model';

/** Figura musicale disegnata (per i pulsanti delle durate) */
export default function NoteIcon({ dur, rest = false, size = 30 }: { dur: Duration; rest?: boolean; size?: number }) {
  const flags = dur === '8' ? 1 : dur === '16' ? 2 : dur === '32' ? 3 : 0;
  if (rest) {
    return (
      <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden>
        {dur === 'w' && <rect x="8" y="11" width="14" height="5" fill="currentColor" />}
        {dur === 'w' && <line x1="4" y1="11" x2="26" y2="11" stroke="currentColor" strokeWidth="1.2" />}
        {dur === 'h' && <rect x="8" y="12" width="14" height="5" fill="currentColor" />}
        {dur === 'h' && <line x1="4" y1="17" x2="26" y2="17" stroke="currentColor" strokeWidth="1.2" />}
        {dur === 'q' && <path d="M12 4 L18 11 L13 16 L18 22 Q12 20 14 26 Q8 21 14 18 L10 12 Z" fill="currentColor" />}
        {flags > 0 && (
          <>
            <line x1="19" y1="7" x2="13" y2="27" stroke="currentColor" strokeWidth="1.6" />
            {Array.from({ length: flags }).map((_, i) => (
              <g key={i}>
                <circle cx={12 - i * 1.5} cy={9 + i * 6} r="2.4" fill="currentColor" />
                <path d={`M12 ${9 + i * 6} Q16 ${11 + i * 6} ${19 - i * 2} ${7 + i * 6}`} stroke="currentColor" strokeWidth="1.4" fill="none" />
              </g>
            ))}
          </>
        )}
      </svg>
    );
  }
  const hollow = dur === 'w' || dur === 'h';
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden>
      <ellipse
        cx="12"
        cy="23"
        rx="5.2"
        ry="3.7"
        transform="rotate(-22 12 23)"
        fill={hollow ? 'none' : 'currentColor'}
        stroke="currentColor"
        strokeWidth={hollow ? 1.8 : 1}
      />
      {dur !== 'w' && <line x1="16.6" y1="22" x2="16.6" y2="3" stroke="currentColor" strokeWidth="1.5" />}
      {Array.from({ length: flags }).map((_, i) => (
        <path key={i} d={`M16.6 ${3 + i * 5} Q24 ${7 + i * 5} 22 ${14 + i * 5}`} stroke="currentColor" strokeWidth="1.8" fill="none" />
      ))}
    </svg>
  );
}
