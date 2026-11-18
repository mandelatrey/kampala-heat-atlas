import type { ReactNode, SVGProps } from "react";
import type { Tone } from "../sites/logic";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };
const svg = (size: number, props: SVGProps<SVGSVGElement>, children: ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>
);

// A small hand-picked icon set, so the app needs no icon library.
export const Icon = {
  check: ({ size = 14, ...p }: IconProps) => svg(size, p, <path d="M5 12.5l4.2 4.2L19 7" />),
  alert: ({ size = 14, ...p }: IconProps) => svg(size, p, <><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17.2v.1" /></>),
  stop: ({ size = 14, ...p }: IconProps) => svg(size, p, <><circle cx="12" cy="12" r="9" /><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" /></>),
  storm: ({ size = 18, ...p }: IconProps) => svg(size, p, <><path d="M7 15a4.5 4.5 0 1 1 .9-8.9A5.5 5.5 0 0 1 18.5 8 3.5 3.5 0 0 1 18 15" /><path d="M12.5 13l-2 4h3l-2 4" /></>),
  sun: ({ size = 16, ...p }: IconProps) => svg(size, p, <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>),
  moon: ({ size = 16, ...p }: IconProps) => svg(size, p, <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />),
  auto: ({ size = 16, ...p }: IconProps) => svg(size, p, <><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" /></>),
  menu: ({ size = 18, ...p }: IconProps) => svg(size, p, <path d="M4 7h16M4 12h16M4 17h16" />),
  close: ({ size = 18, ...p }: IconProps) => svg(size, p, <path d="M6 6l12 12M18 6L6 18" />),
  map: ({ size = 16, ...p }: IconProps) => svg(size, p, <><path d="M9 4L3 6.5v13.5L9 17.5l6 2.5 6-2.5V4l-6 2.5z" /><path d="M9 4v13.5M15 6.5V20" /></>),
  layers: ({ size = 16, ...p }: IconProps) => svg(size, p, <><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></>),
  hardhat: ({ size = 16, ...p }: IconProps) => svg(size, p, <><path d="M3 17h18" /><path d="M5 17v-3a7 7 0 0 1 14 0v3" /><path d="M10 7.5V5h4v2.5" /></>),
  arrowOut: ({ size = 13, ...p }: IconProps) => svg(size, p, <path d="M8 16L16 8M9.5 8H16v6.5" />),
  arrowRight: ({ size = 15, ...p }: IconProps) => svg(size, p, <path d="M5 12h14M13 6l6 6-6 6" />),
  search: ({ size = 16, ...p }: IconProps) => svg(size, p, <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>),
  drop: ({ size = 14, ...p }: IconProps) => svg(size, p, <path d="M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5z" />),
  wind: ({ size = 14, ...p }: IconProps) => svg(size, p, <path d="M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3" />),
  heat: ({ size = 14, ...p }: IconProps) => svg(size, p, <><path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z" /><path d="M12 11v5" /></>),
  info: ({ size = 14, ...p }: IconProps) => svg(size, p, <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.8v.1" /></>),
};

const TONE_ICON: Record<Tone, (p: IconProps) => ReactNode> = { good: Icon.check, warning: Icon.alert, critical: Icon.stop };

/** A status: icon + word + colour, so it never relies on colour alone. */
export function StatusPill({ tone, children }: { tone: Tone; children: ReactNode }) {
  const I = TONE_ICON[tone];
  return <span className={`pill tone-${tone}`}><I size={13} />{children}</span>;
}

export function Card({ className = "", children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLElement>) {
  return <section className={`card ${className}`} {...rest}>{children}</section>;
}

/** Brand mark: the sun's arc over a horizon. */
export function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--ink)" />
      <path d="M6 21c3-9 17-9 20 0" stroke="var(--accent)" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <circle cx="11.5" cy="15.2" r="2.6" fill="#fbca0c" />
      <path d="M6 23.5h20" stroke="var(--surface)" strokeWidth="1.6" strokeLinecap="round" opacity=".7" />
    </svg>
  );
}
