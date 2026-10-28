interface IconProps {
  size?: number;
  className?: string;
}

/**
 * Minimalist geometric icon combining an open study book with a rising momentum / focus spark.
 * Preserves the cream-and-lime aesthetic.
 */
export function StudyMomentumIcon({ size = 24, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      {/* Minimalist Book Pages & Spine */}
      <path
        d="M3 18.5C6 17 9 17.5 12 19C15 17.5 18 17 21 18.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M3 9.5C6 8 9 8.5 12 10C15 8.5 18 8 21 9.5V18.5C18 17 15 17.5 12 19C9 17.5 6 17 3 18.5V9.5Z"
        fill="currentColor"
        fillOpacity="0.12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M12 10V19"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Momentum Progress Spark / Focus Star in Lime Accent */}
      <path
        d="M12 2.5L13.8 5.4L17 6.2L14.7 8.4L15.3 11.6L12 9.9L8.7 11.6L9.3 8.4L7 6.2L10.2 5.4L12 2.5Z"
        fill="#8eb723"
      />
    </svg>
  );
}

/**
 * Full StudyMomentum wordmark pairing the icon, refined typography, and lime asterisk.
 */
export function StudyMomentumWordmark({
  size = 24,
  showDot = true,
}: {
  size?: number;
  showDot?: boolean;
}) {
  return (
    <span className="brand-wordmark">
      <StudyMomentumIcon size={size} className="brand-wordmark-icon" />
      <span className="brand-text">
        <span className="brand-study">Study</span>
        <span className="brand-momentum">Momentum</span>
      </span>
      {showDot && <span className="brand-dot">✳</span>}
    </span>
  );
}
