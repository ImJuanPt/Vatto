import { Outlet } from "react-router-dom";
import { Navbar } from "../components/Navbar";

export function ProtectedLayout({ onLogout, user }: { onLogout: () => void; user: any }) {
  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <Navbar user={user} onLogout={onLogout} onNavigate={() => { console.log("Navigating..."); }} />

      <div className="p-6">
        <Outlet />
      </div>
    </div>
  );
}
