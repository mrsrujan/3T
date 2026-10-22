export type FlagCode = "US" | "IN" | "CN" | "KR" | "TW" | "JP";

interface Props {
  code: FlagCode;
  className?: string;
}

// Windows Chromium/Edge doesn't render Unicode regional-indicator flag emoji
// as flags (falls back to showing the two-letter code) - inline SVGs render
// consistently everywhere regardless of OS emoji-font support.
export function FlagIcon({ code, className = "h-3 w-4" }: Props) {
  switch (code) {
    case "IN":
      return (
        <svg viewBox="0 0 24 16" className={className} aria-hidden="true">
          <rect width="24" height="16" fill="#fff" />
          <rect width="24" height="5.33" fill="#FF9933" />
          <rect y="10.67" width="24" height="5.33" fill="#138808" />
          <circle cx="12" cy="8" r="2.2" fill="none" stroke="#000088" strokeWidth="0.35" />
          <circle cx="12" cy="8" r="0.35" fill="#000088" />
        </svg>
      );
    case "CN":
      return (
        <svg viewBox="0 0 24 16" className={className} aria-hidden="true">
          <rect width="24" height="16" fill="#DE2910" />
          <path d="M4 3 L5 6.2 L2.2 4.4 L5.8 4.4 L3 6.2 Z" fill="#FFDE00" />
          <path d="M8.5 1.5 L8.9 2.6 L8.1 2.6 Z" fill="#FFDE00" />
          <path d="M10.3 3.3 L10.7 4.4 L9.9 4.4 Z" fill="#FFDE00" />
          <path d="M10.3 5.9 L10.7 7 L9.9 7 Z" fill="#FFDE00" />
          <path d="M8.5 7.7 L8.9 8.8 L8.1 8.8 Z" fill="#FFDE00" />
        </svg>
      );
    case "KR":
      return (
        <svg viewBox="0 0 24 16" className={className} aria-hidden="true">
          <rect width="24" height="16" fill="#fff" />
          <path d="M12 4.5 A3.5 3.5 0 0 1 12 11.5 A1.75 1.75 0 0 1 12 8 A1.75 1.75 0 0 0 12 4.5 Z" fill="#CD2E3A" />
          <path d="M12 4.5 A3.5 3.5 0 0 0 12 11.5 A1.75 1.75 0 0 0 12 8 A1.75 1.75 0 0 1 12 4.5 Z" fill="#0047A0" />
        </svg>
      );
    case "TW":
      return (
        <svg viewBox="0 0 24 16" className={className} aria-hidden="true">
          <rect width="24" height="16" fill="#FE0000" />
          <rect width="12" height="8" fill="#000095" />
          <circle cx="6" cy="4" r="2" fill="#fff" />
        </svg>
      );
    case "JP":
      return (
        <svg viewBox="0 0 24 16" className={className} aria-hidden="true">
          <rect width="24" height="16" fill="#fff" />
          <circle cx="12" cy="8" r="3.6" fill="#BC002D" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 16" className={className} aria-hidden="true">
          <rect width="24" height="16" fill="#B22234" />
          {[1, 3, 5, 7, 9, 11].map((i) => (
            <rect key={i} y={(i * 16) / 13} width="24" height={16 / 13} fill="#fff" />
          ))}
          <rect width="10.5" height="8.6" fill="#3C3B6E" />
        </svg>
      );
  }
}
