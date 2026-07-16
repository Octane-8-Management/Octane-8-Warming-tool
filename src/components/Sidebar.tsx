"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { BoltIcon, GridIcon, LogOutIcon } from "./icons";
import { OctaneLogoMark } from "./OctaneLogoMark";

const NAV_ITEMS = [
  { href: "/", label: "Trigger", icon: BoltIcon },
  { href: "/accounts", label: "Dashboard", icon: GridIcon },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

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
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="sidebar-footer-name">Octane 8</p>
          <p className="sidebar-footer-email">octane8.management@gmail.com</p>
        </div>
        <button
          className="sidebar-logout"
          onClick={handleLogout}
          title="Log out"
          aria-label="Log out"
        >
          <LogOutIcon size={16} />
        </button>
      </div>
    </aside>
  );
}
