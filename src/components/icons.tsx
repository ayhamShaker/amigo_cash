const PATHS = {
  bolt: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
  survey: (<><path d="M9 3h6v3H9z" /><path d="M7 5H5v16h14V5h-2" /><path d="M9 11h6M9 15h4" /></>),
  wallet: (<><path d="M3 7h16a2 2 0 012 2v9a2 2 0 01-2 2H3z" /><path d="M3 7l12-4v4" /><path d="M16 13.5h2" /></>),
  users: (<><circle cx="9" cy="7" r="4" /><path d="M1.5 21a7.5 7.5 0 0115 0" /><path d="M16 3.3a4 4 0 010 7.4M22.5 21a7 7 0 00-4.5-6.5" /></>),
  trophy: (<><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0z" /><path d="M7 6H4a3 3 0 003 4M17 6h3a3 3 0 01-3 4" /></>),
  list: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  user: (<><circle cx="12" cy="7" r="5" /><path d="M3 22a9 9 0 0118 0" /></>),
  help: (<><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3M12 17h.01" /></>),
  grid: <path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" />,
  shield: (<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></>),
  tag: (<><path d="M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L2 12V2h10l8.6 8.6a2 2 0 010 2.8z" /><path d="M7 7h.01" /></>),
  plug: <path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 01-12 0zM12 18v4" />,
  inbox: (<><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5h13L22 12v7H2v-7z" /></>),
  chat: <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />,
  sliders: <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />,
  gift: (<><path d="M20 12v10H4V12M2 7h20v5H2zM12 22V7" /><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" /></>),
  out: <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />,
  check: <path d="M20 6L9 17l-5-5" />,
  x: <path d="M18 6L6 18M6 6l12 12" />,
  copy: (<><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M4 16V4a1 1 0 011-1h11" /></>),
  clock: (<><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>),
  star: <path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />,
  game: (<><rect x="2" y="6" width="20" height="12" rx="6" /><path d="M6 12h4M8 10v4M15 11h.01M18 13h.01" /></>),
  eye: (<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>),
  eyeOff: <path d="M17.9 17.9A10.4 10.4 0 0112 20C5 20 1 12 1 12a18.6 18.6 0 015.1-5.9M9.9 4.2A9.6 9.6 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.2 3.2M14.1 14.1a3 3 0 01-4.2-4.2M1 1l22 22" />,
  plus: <path d="M12 5v14M5 12h14" />,
  globe: (<><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20" /></>),
  lock: (<><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></>),
  home: (<><path d="M3 10l9-7 9 7v11H3z" /><path d="M9 21v-7h6v7" /></>),
  sun: (<><circle cx="12" cy="12" r="4.5" /><path d="M12 1.5v2.5M12 20v2.5M1.5 12H4M20 12h2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8" /></>),
  moon: <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />,
  bell: (<><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 01-3.4 0" /></>),
  mail: (<><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 6l10 7 10-7" /></>),
  file: (<><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></>),
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className, size }: { name: IconName; className?: string; size?: number }) {
  return (
    <svg className={`i ${className ?? ""}`} viewBox="0 0 24 24" aria-hidden="true" style={size ? { width: size, height: size } : undefined}>
      {PATHS[name]}
    </svg>
  );
}

export function Coins({ n }: { n: number }) {
  return (
    <span className="amt" dir="ltr">
      <span className="coin">A</span>
      {Math.round(n).toLocaleString("en-US")}
    </span>
  );
}

export function Logo({ href }: { href: string }) {
  return (
    <a className="logo" href={href} aria-label="Amigo Cash">
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny static PNG, no optimisation needed */}
      <img className="logo-mark" src="/logo-mark-128.png" alt="" width={36} height={36} />
      <span className="wm">
        <b>Amigo</b>
        <span>Cash</span>
      </span>
    </a>
  );
}
