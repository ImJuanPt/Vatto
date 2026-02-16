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
    <nav className="flex items-center justify-between rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-2 shadow-lg backdrop-blur-md">
      {/* Logo y Marca */}
      <NavLink to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
        <img 
          src="/LogoVatto.png" 
          alt="Vatto Logo" 
          className="h-20 w-20 object-contain"
        />
        <div className="flex flex-col justify-center">
          <p className="text-base font-semibold text-white leading-tight">Vatto</p>
          <p className="text-xs text-emerald-100 leading-tight">Monitor inteligente</p>
        </div>
      </NavLink>

      {/* Navegación Central */}
      <div className="flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-400/10 p-1 text-sm font-medium text-emerald-100">
        {navItems.map((item) => (
          <NavLink
            key={item.id}
            to={item.to}
            className={({ isActive }) =>
              `rounded-full px-4 py-1.5 transition-all duration-200 ${
                isActive ? "bg-white text-emerald-600 shadow" : "hover:bg-emerald-500/20 hover:text-white"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </div>

      {/* Avatar Usuario */}
      <UserAvatar user={user} onLogout={onLogout} />
    </nav>
  );
}
