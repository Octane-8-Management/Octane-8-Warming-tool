import Sidebar from "@/components/Sidebar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main">{children}</div>
    </div>
  );
}
