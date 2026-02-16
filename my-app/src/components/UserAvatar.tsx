import { useState } from "react";
import { LucideChevronDown, LucideLogOut } from "lucide-react";
import { User } from "../types/user";
import { useNavigate } from "react-router-dom";

interface UserAvatarProps {
  user: User;
  onLogout?: () => void;
}

export function UserAvatar({ user, onLogout }: UserAvatarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const initials = (user.fullName ?? "")
    .split(" ")
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);

  const handleToggle = () => setIsOpen((prev) => !prev);
  const handleLogout = () => {
    setIsOpen(false);
    onLogout?.();
    navigate("/");
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className="flex items-center gap-3 rounded-full border border-white/15 bg-white/10 px-3 py-1 shadow-sm transition-all duration-200 hover:bg-white/20"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-sm font-semibold text-white">
          {initials}
        </div>
        <div className="hidden text-left sm:flex sm:flex-col">
          <span className="text-sm font-semibold text-white">{user.fullName}</span>
          <span className="text-xs text-emerald-100">{user.role}</span>
        </div>
        <LucideChevronDown
          className={`h-4 w-4 text-emerald-100 transition-transform duration-200 ${
            isOpen ? "rotate-180" : "rotate-0"
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-44 rounded-2xl border border-white/15 bg-slate-900/90 p-2 shadow-2xl backdrop-blur-md">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-100 transition-colors duration-200 hover:bg-white/10 hover:text-emerald-200"
          >
            <LucideLogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
