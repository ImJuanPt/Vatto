import { LucideFilter } from "lucide-react";

type FilterOption = {
  id: string;
  label: string;
};

type FiltersToolbarProps = {
  activeFilter: string;
  onFilterChange: (filter: string) => void;
};

const FILTERS: FilterOption[] = [
  { id: "all", label: "Todos" },
  { id: "kitchen", label: "Cocina" },
  { id: "climate", label: "Climatización" },
  { id: "laundry", label: "Lavandería" },
  { id: "entertainment", label: "Entretenimiento" },
  { id: "other", label: "Otros" },
];

export function FiltersToolbar({ activeFilter, onFilterChange }: FiltersToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-emerald-100 shadow-lg backdrop-blur">
      <div className="flex items-center gap-2 text-sm font-medium">
        <LucideFilter className="h-4 w-4" />
        <span>Filtrar por categoría</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => {
          const isActive = activeFilter === filter.id;
          return (
            <button
              key={filter.id}
              type="button"
              onClick={() => onFilterChange(filter.id)}
              className={`px-3 py-1.5 text-sm rounded-full border transition-all duration-200 ${
                isActive
                  ? "bg-white text-emerald-600 border-white shadow"
                  : "border-emerald-400/40 text-emerald-100 hover:bg-emerald-500/20"
              }`}
            >
              {filter.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
