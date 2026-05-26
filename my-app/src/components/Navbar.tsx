import { NavLink } from "react-router-dom";
import { User } from "../types/user";
import { UserAvatar } from "./UserAvatar";

interface NavbarProps {
  user: User;
  onLogout?: () => void;
  onNavigate: () => void;
  activeSection?: string;
}

const navItems = [
  { id: "welcome", label: "Inicio", to: "/" },
  { id: "summary", label: "Resumen", to: "/resumen" },
  { id: "gestion", label: "Gestión", to: "/gestion" },
];

export function Navbar({ user, onLogout }: NavbarProps) {
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 shadow-lg backdrop-blur-md">
      {/* Logo y Marca */}
      <NavLink to="/" className="flex min-w-0 items-center gap-2 hover:opacity-80 transition-opacity">
        <img
          src="/LogoVatto.png"
          alt="Vatto Logo"
          className="h-12 w-12 sm:h-20 sm:w-20 object-contain"
        />
        <div className="min-w-0 flex flex-col justify-center">
          <p className="truncate text-base font-semibold text-white leading-tight">Vatto</p>
          <p className="truncate text-xs text-emerald-100 leading-tight">Monitor inteligente</p>
        </div>
      </NavLink>

      {/* Navegación Central */}
      <div className="flex w-full flex-wrap items-center justify-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-400/10 p-1 text-sm font-medium text-emerald-100 sm:w-auto sm:justify-center sm:mx-4">
        {navItems.map((item) => (
          <NavLink
            key={item.id}
            to={item.to}
            className={({ isActive }) =>
              `rounded-full px-4 py-1.5 text-center transition-all duration-200 ${
                isActive ? "bg-white text-emerald-600 shadow" : "hover:bg-emerald-500/20 hover:text-white"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </div>

      {/* Avatar Usuario */}
      <div className="min-w-0">
        <UserAvatar user={user} onLogout={onLogout} />
      </div>
    </nav>
  );
}
