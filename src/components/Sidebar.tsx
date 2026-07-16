"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BoltIcon, GridIcon } from "./icons";
import { OctaneLogoMark } from "./OctaneLogoMark";

const NAV_ITEMS = [
  { href: "/", label: "Trigger", icon: BoltIcon },
  { href: "/accounts", label: "Dashboard", icon: GridIcon },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <OctaneLogoMark size={26} />
        <span className="sidebar-logo-text">Octane 8</span>
      </div>

      <p className="sidebar-section-label">Automation</p>
      <nav className="sidebar-nav">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`sidebar-link ${active ? "active" : ""}`}
            >
              <Icon size={18} className="sidebar-link-icon" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-avatar">O8</div>
        <div>
          <p className="sidebar-footer-name">Octane 8</p>
          <p className="sidebar-footer-email">octane8.management@gmail.com</p>
        </div>
      </div>
    </aside>
  );
}
