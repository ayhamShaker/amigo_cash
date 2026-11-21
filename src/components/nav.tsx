"use client";

import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";

export type NavItem = { href: string; label: string; icon: IconName; locked?: boolean; badge?: number };

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SideNav({ items, lockLabel }: { items: NavItem[]; lockLabel: string }) {
  const pathname = usePathname() ?? "";
  return (
    <>
      {items.map((it) => (
        <a key={it.href} className={`navlink ${isActive(pathname, it.href) ? "on" : ""}`} href={it.href} aria-current={isActive(pathname, it.href) ? "page" : undefined}>
          <Icon name={it.icon} />
          {it.label}
          {it.locked ? (
            <span className="lockic" title={lockLabel}>
              <Icon name="lock" />
            </span>
          ) : null}
          {it.badge ? <span className="badge">{it.badge}</span> : null}
        </a>
      ))}
    </>
  );
}

export function BottomNav({ items, label }: { items: NavItem[]; label: string }) {
  const pathname = usePathname() ?? "";
  return (
    <nav className="bottomnav" aria-label={label}>
      {items.map((it) => (
        <a key={it.href} href={it.href} className={isActive(pathname, it.href) ? "on" : ""}>
          <Icon name={it.icon} />
          {it.label}
        </a>
      ))}
    </nav>
  );
}
