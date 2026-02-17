import { useMemo, useState, useEffect } from "react";
import { FiltersToolbar } from "../components/FiltersToolbar";
import { Appliance } from "../types/appliance";
import { User } from "../types/user";
import { useNavigate } from "react-router-dom";
import { ApplianceCard } from "../components/ApplianceCard";
import { getLocations, createLocation, deleteLocation } from "../api/locations";
import { getDevices, findDeviceByMac, updateDevice } from "../api/devices";
import api from "../api/client";
import { getDeviceMetrics } from "../api/deviceMetrics";
import { Location } from "../types/location";
import { useCallback } from "react";

interface GestionPageProps {
  user: User;
  onLogout?: () => void;
}

export function GestionPage({ user, onLogout }: GestionPageProps) {
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [appliances, setAppliances] = useState<Appliance[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateLocation, setShowCreateLocation] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [newLocationAddress, setNewLocationAddress] = useState("");
  const [newLocationTimezone, setNewLocationTimezone] = useState("");
  const [addingDeviceLocationId, setAddingDeviceLocationId] = useState<
    number | null
  >(null);
  const [macToRegister, setMacToRegister] = useState("");
  const [foundDevice, setFoundDevice] = useState<any | null>(null);
  const [deviceNameInput, setDeviceNameInput] = useState("");
  const [deviceTypeInput, setDeviceTypeInput] = useState("");
  const [addDeviceMode, setAddDeviceMode] = useState<'byMac' | 'create'>('byMac');
  const [pairingCodeShown, setPairingCodeShown] = useState<string | null>(null);
  const [creatingDevice, setCreatingDevice] = useState(false);
  const [expandedLocations, setExpandedLocations] = useState<
    Record<string, boolean>
  >({});
  const [deletingLocationId, setDeletingLocationId] = useState<number | null>(null);
  const [deleteLocationError, setDeleteLocationError] = useState<{ message: string; deviceCount?: number } | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    (async () => {
      try {
        const [devs, locs, metrics] = await Promise.all([
          getDevices(),
          getLocations(),
          getDeviceMetrics().catch(() => ({}))
        ]);
        
        if (!mounted) return;
        
        // Enriquecer dispositivos con métricas si no vienen del backend
        const enrichedDevs = devs.map((dev: any) => {
          const devNum = Number(dev.id);
          const metricsMap = metrics as Record<number, any>;
          if (metricsMap && metricsMap[devNum] && (dev.monthlyKWh === 0 || dev.usageHoursPerDay === 0)) {
            const enriched = {
              ...dev,
              monthlyKWh: metricsMap[devNum].monthlyKWh || dev.monthlyKWh,
              usageHoursPerDay: metricsMap[devNum].usageHoursPerDay || dev.usageHoursPerDay
            };
            console.log(`[GestionPage] Enriched ${dev.name}: monthlyKWh=${enriched.monthlyKWh}, usageHoursPerDay=${enriched.usageHoursPerDay}`);
            return enriched;
          }
          console.log(`[GestionPage] Using backend data for ${dev.name}: monthlyKWh=${dev.monthlyKWh}, usageHoursPerDay=${dev.usageHoursPerDay}`);
          return dev;
        });
        
        setAppliances(enrichedDevs as any);
        setLocations(locs);
      } catch (err) {
        console.warn("Failed loading devices/locations", err);
        setAppliances([]);
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);
  const navigate = useNavigate();

  const filteredAppliances = useMemo(() => {
    if (categoryFilter === "all") return appliances;
    return appliances.filter(
      (appliance) => appliance.category === categoryFilter
    );
  }, [categoryFilter, appliances]);

  const handleSelectAppliance = (applianceId: string) => {
    navigate(`/appliance/${applianceId}`);
  };

  const hasNoResults = filteredAppliances.length === 0;

  // When a category filter is active, only show locations that have matching devices
  const visibleLocations =
    categoryFilter === "all"
      ? locations
      : locations.filter((loc) =>
          filteredAppliances.some((a) => a._meta?.locationId == loc.id)
        );

  const refreshData = useCallback(async () => {
    setLoading(true);
    try {
      const devs = await getDevices();
      const locs = await getLocations();
      setAppliances(devs as any);
      setLocations(locs);
    } catch (err) {
      console.warn("refreshData failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  async function handleCreateLocation() {
    if (!newLocationName.trim()) return;
    const created = await createLocation(
      newLocationName.trim(),
      newLocationAddress.trim(),
      newLocationTimezone.trim(),
      user?.id ? Number(user.id) : undefined
    );
    if (created) {
      setShowCreateLocation(false);
      setNewLocationName("");
      setNewLocationAddress("");
      setNewLocationTimezone("");
      await refreshData();
    }
  }

  async function handleDeleteLocation(locationId: number) {
    const result = await deleteLocation(locationId);
    
    if (!result.success) {
      setDeleteLocationError({
        message: result.error || "Error al eliminar la ubicación",
        deviceCount: result.deviceCount
      });
      setDeletingLocationId(null);
      return;
    }
    
    setDeletingLocationId(null);
    setDeleteLocationError(null);
    await refreshData();
  }

  function openAddDeviceModal(locationId: string | number) {
    setAddingDeviceLocationId(Number(locationId));
    setMacToRegister("");
    setFoundDevice(null);
    setDeviceNameInput("");
    setDeviceTypeInput("");
    setAddDeviceMode('byMac');
    setPairingCodeShown(null);
  }

  function toggleLocationExpanded(locationId: string | number) {
    const key = String(locationId);
    setExpandedLocations((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleFindByMac() {
    if (!macToRegister.trim()) return;
    const d = await findDeviceByMac(macToRegister.trim());
    if (!d) {
      alert("No se encontró un dispositivo con esa MAC.");
      return;
    }
    setFoundDevice(d);
    setDeviceNameInput(d.name || "");
    setDeviceTypeInput((d._meta && d._meta.currentState) || "");
  }

  async function handleRegisterDevice() {
    if (!foundDevice || addingDeviceLocationId == null) return;
    const payload: any = {
      name: deviceNameInput || foundDevice.name,
      deviceType: deviceTypeInput || foundDevice.category,
      locationId: addingDeviceLocationId,
    };
    const updated = await updateDevice(foundDevice.id, payload);
    if (updated) {
      setAddingDeviceLocationId(null);
      setFoundDevice(null);
      await refreshData();
    } else {
      alert("No se pudo registrar el dispositivo.");
    }
  }

  return (
    <main className="min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="relative mx-auto flex max-w-6xl flex-col gap-8 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
        <header className="space-y-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/60 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-200">
            Gestión de aparatos
          </span>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Inventario y análisis individual
          </h1>
          <p className="max-w-2xl text-base text-slate-200 sm:text-lg">
            Selecciona un aparato para revisar su historial de consumo,
            comportamiento semanal y recomendaciones específicas.
          </p>
        </header>

        <FiltersToolbar
          activeFilter={categoryFilter}
          onFilterChange={setCategoryFilter}
        />

        <section className="rounded-3xl border border-white/10 bg-white/10 p-6 shadow-lg backdrop-blur-sm">
          <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Inventario de aparatos
              </h2>
              <p className="text-sm text-emerald-100">
                Consulta el detalle de uso, potencia y última actualización
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-xs font-medium text-emerald-100">
                Mostrar {filteredAppliances.length} aparatos
              </div>
              <button
                onClick={() => setShowCreateLocation(true)}
                className="text-xs rounded bg-emerald-500/20 px-3 py-1 text-emerald-100 cursor-pointer transform transition duration-200 hover:scale-105 active:scale-95 focus:outline-none hover:bg-emerald-500/30"
              >
                Crear ubicacion
              </button>
            </div>
          </header>

          {loading ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 px-4 py-10 text-center text-sm text-emerald-100">
              Cargando aparatos...
            </div>
          ) : hasNoResults ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 px-4 py-10 text-center text-sm text-emerald-100">
              No hay aparatos en esta categoría por ahora.
            </div>
          ) : (
            <div className="mt-6 space-y-6">
              {visibleLocations.map((loc) => {
                const deviceList = filteredAppliances.filter(
                  (a) => a._meta?.locationId == loc.id
                );
                const isExpanded = !!expandedLocations[String(loc.id)];
                return (
                  <div
                    key={loc.id}
                    className="rounded-xl border border-white/10 bg-white/5 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-white font-semibold">
                          {loc.name}{" "}
                          <span className="text-sm text-emerald-200">
                            ({deviceList.length})
                          </span>
                        </h3>
                        <p className="text-xs text-emerald-100">
                          {loc.address}
                        </p>
                      </div>
                      <div className="flex gap-2 items-center">
                        <button
                          onClick={() => toggleLocationExpanded(loc.id)}
                          className="flex items-center gap-2 text-xs rounded bg-white/5 px-2 py-1 text-emerald-100 cursor-pointer transform transition duration-200 hover:scale-105 active:scale-95 focus:outline-none"
                        >
                          <span>{isExpanded ? "Ocultar" : "Mostrar"}</span>
                          <svg
                            className={`w-3 h-3 transition-transform duration-300 ${
                              isExpanded ? "rotate-180" : "rotate-0"
                            }`}
                            viewBox="0 0 20 20"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            aria-hidden
                          >
                            <path
                              d="M5 8L10 13L15 8"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>

                        <button
                          onClick={() => openAddDeviceModal(loc.id)}
                          className="text-xs rounded bg-emerald-500/20 px-3 py-1 text-emerald-100 cursor-pointer transform transition duration-200 hover:scale-105 active:scale-95 focus:outline-none hover:bg-emerald-500/30"
                        >
                          Agregar dispositivo
                        </button>

                        <button
                          onClick={() => {
                            if (deviceList.length > 0) {
                              setDeleteLocationError({
                                message: `Esta ubicación tiene ${deviceList.length} dispositivo(s) registrado(s). Mueve o elimina los dispositivos primero.`,
                                deviceCount: deviceList.length
                              });
                            } else {
                              setDeletingLocationId(Number(loc.id));
                            }
                          }}
                          className="text-xs rounded bg-red-500/20 px-3 py-1 text-red-100 cursor-pointer transform transition duration-200 hover:scale-105 active:scale-95 focus:outline-none hover:bg-red-500/30"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                    <div
                      className={`mt-4 overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out ${
                        isExpanded
                          ? "max-h-[700px] opacity-100"
                          : "max-h-0 opacity-0 pointer-events-none"
                      }`}
                      aria-hidden={!isExpanded}
                    >
                      {/* Inner grid scrollable cuando hay muchos dispositivos; mayor umbral para mostrar scrollbar */}
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 max-h-[640px] overflow-auto pr-2">
                        {deviceList.map((ap) => (
                          <button
                            key={ap.id}
                            onClick={() => handleSelectAppliance(ap.id)}
                            className="text-left w-full transform transition duration-200 hover:-translate-y-1 hover:shadow-lg"
                            aria-label={`Abrir ${ap.name}`}
                          >
                            <ApplianceCard
                              appliance={ap}
                              highUsageThreshold={Infinity}
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        {/* Create Location Modal (simple) */}
        {showCreateLocation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-xl bg-slate-800 p-6">
              <h3 className="text-lg font-semibold text-white mb-3">
                Crear location
              </h3>
              <label className="text-sm text-emerald-100">Nombre</label>
              <input
                value={newLocationName}
                onChange={(e) => setNewLocationName(e.target.value)}
                className="w-full mb-3 rounded px-3 py-2"
                placeholder="Nombre de la ubicación"
              />
              <label className="text-sm text-emerald-100">Dirección</label>
              <input
                value={newLocationAddress}
                onChange={(e) => setNewLocationAddress(e.target.value)}
                className="w-full mb-3 rounded px-3 py-2"
                placeholder="Calle 123, Ciudad"
              />
              <label className="text-sm text-emerald-100">Timezone</label>
              <input
                value={newLocationTimezone}
                onChange={(e) => setNewLocationTimezone(e.target.value)}
                className="w-full mb-3 rounded px-3 py-2"
                placeholder="America/Argentina/Buenos_Aires"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowCreateLocation(false)}
                  className="px-3 py-2 rounded bg-white/5"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateLocation}
                  className="px-3 py-2 rounded bg-emerald-500"
                >
                  Crear
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Device Modal */}
        {addingDeviceLocationId !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-lg rounded-xl bg-slate-800 p-6">
              <h3 className="text-lg font-semibold text-white mb-3">
                Registrar dispositivo a location
              </h3>
              {!foundDevice ? (
                <div>
                  <div className="flex gap-2 mb-3">
                    <button
                      onClick={() => setAddDeviceMode('byMac')}
                      className={`px-3 py-2 rounded ${addDeviceMode === 'byMac' ? 'bg-emerald-600' : 'bg-white/5'}`}
                    >
                      Buscar por MAC
                    </button>
                    <button
                      onClick={() => setAddDeviceMode('create')}
                      className={`px-3 py-2 rounded ${addDeviceMode === 'create' ? 'bg-emerald-600' : 'bg-white/5'}`}
                    >
                      Crear nuevo dispositivo
                    </button>
                  </div>

                  {addDeviceMode === 'byMac' ? (
                    <>
                      <p className="text-sm text-emerald-100 mb-2">
                        Introduce la MAC del dispositivo para validar
                      </p>
                      <input
                        value={macToRegister}
                        onChange={(e) => setMacToRegister(e.target.value)}
                        className="w-full mb-3 rounded px-3 py-2"
                        placeholder="AA:BB:CC:DD:EE:FF"
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => setAddingDeviceLocationId(null)}
                          className="px-3 py-2 rounded bg-white/5"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={handleFindByMac}
                          className="px-3 py-2 rounded bg-emerald-500"
                        >
                          Validar MAC
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      {!pairingCodeShown ? (
                        <>
                          <p className="text-sm text-emerald-100 mb-2">Crear un nuevo dispositivo en esta ubicación</p>
                          <label className="text-sm">Nombre</label>
                          <input
                            value={deviceNameInput}
                            onChange={(e) => setDeviceNameInput(e.target.value)}
                            className="w-full mb-3 rounded px-3 py-2 bg-slate-800 text-white"
                            placeholder="Ej: Refrigerador"
                          />
                          <label className="text-sm">Tipo</label>
                          <select
                            value={deviceTypeInput}
                            onChange={(e) => setDeviceTypeInput(e.target.value)}
                            className="w-full mb-3 rounded px-3 py-2 bg-slate-800 text-white border border-slate-600 focus:outline-none focus:border-emerald-500"
                          >
                            <option value="">Selecciona un tipo</option>
                            <optgroup label="Cocina">
                              <option value="refrigerator">Refrigerador</option>
                              <option value="oven">Horno</option>
                              <option value="microwave">Microondas</option>
                              <option value="dishwasher">Lavavajillas</option>
                              <option value="coffee_maker">Cafetera</option>
                              <option value="blender">Licuadora</option>
                              <option value="toaster">Tostadora</option>
                            </optgroup>
                            <optgroup label="Clima">
                              <option value="ac">Aire Acondicionado</option>
                              <option value="heater">Calefactor</option>
                              <option value="fan">Ventilador</option>
                              <option value="thermostat">Termostato</option>
                            </optgroup>
                            <optgroup label="Lavandería">
                              <option value="washer">Lavadora</option>
                              <option value="dryer">Secadora</option>
                              <option value="iron">Plancha</option>
                            </optgroup>
                            <optgroup label="Entretenimiento">
                              <option value="tv">Televisor</option>
                              <option value="speaker">Parlante</option>
                              <option value="console">Consola de Videojuegos</option>
                              <option value="projector">Proyector</option>
                            </optgroup>
                            <optgroup label="Hogar">
                              <option value="lights">Luces</option>
                              <option value="fridge_small">Mini Refrigerador</option>
                              <option value="vacuum">Aspiradora</option>
                              <option value="printer">Impresora</option>
                              <option value="router">Router</option>
                              <option value="computer">Computadora</option>
                              <option value="laptop">Laptop</option>
                              <option value="monitor">Monitor</option>
                            </optgroup>
                            <optgroup label="Otro">
                              <option value="other">Otro</option>
                            </optgroup>
                          </select>
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => setAddingDeviceLocationId(null)}
                              className="px-3 py-2 rounded bg-white/5"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={async () => {
                                if (!deviceNameInput) { alert('Ingresa un nombre'); return; }
                                setCreatingDevice(true);
                                try {
                                  const res = await api.post<any>('/api/v1/devices', {
                                    locationId: addingDeviceLocationId,
                                    name: deviceNameInput,
                                    deviceType: deviceTypeInput || 'other',
                                    maxWattsThreshold: 1000,
                                  });
                                  // prefer backend pairingCode, otherwise generate locally
                                  const code = res?.pairingCode || String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
                                  setPairingCodeShown(code);
                                } catch (err) {
                                  console.error('create device failed', err);
                                  alert('Error creando dispositivo');
                                } finally {
                                  setCreatingDevice(false);
                                }
                              }}
                              className="px-3 py-2 rounded bg-emerald-500"
                            >
                              {creatingDevice ? 'Creando...' : 'Crear dispositivo'}
                            </button>
                          </div>
                        </>
                      ) : (
                        <div>
                          <p className="text-sm text-emerald-100 mb-2">Dispositivo creado. Código de emparejamiento:</p>
                          <div className="rounded-lg border-2 border-emerald-500 bg-emerald-500/20 p-4 mb-3">
                            <p className="text-2xl font-mono font-bold text-emerald-300 tracking-widest">{pairingCodeShown}</p>
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => { setPairingCodeShown(null); setAddingDeviceLocationId(null); }} className="px-3 py-2 rounded bg-emerald-500">Cerrar</button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div>
                  <p className="text-sm text-emerald-100 mb-2">
                    Dispositivo encontrado:{" "}
                    <span className="font-semibold text-white">
                      {foundDevice.name}
                    </span>
                  </p>
                  <label className="text-sm">Nombre</label>
                  <input
                    value={deviceNameInput}
                    onChange={(e) => setDeviceNameInput(e.target.value)}
                    className="w-full mb-3 rounded px-3 py-2 bg-slate-800 text-white"
                  />
                  <label className="text-sm">Tipo</label>
                  <select
                    value={deviceTypeInput}
                    onChange={(e) => setDeviceTypeInput(e.target.value)}
                    className="w-full mb-3 rounded px-3 py-2 bg-slate-700 text-white border border-slate-600 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">Selecciona un tipo</option>
                    <optgroup label="Cocina">
                      <option value="refrigerator">Refrigerador</option>
                      <option value="oven">Horno</option>
                      <option value="microwave">Microondas</option>
                      <option value="dishwasher">Lavavajillas</option>
                      <option value="coffee_maker">Cafetera</option>
                      <option value="blender">Licuadora</option>
                      <option value="toaster">Tostadora</option>
                    </optgroup>
                    <optgroup label="Clima">
                      <option value="ac">Aire Acondicionado</option>
                      <option value="heater">Calefactor</option>
                      <option value="fan">Ventilador</option>
                      <option value="thermostat">Termostato</option>
                    </optgroup>
                    <optgroup label="Lavandería">
                      <option value="washer">Lavadora</option>
                      <option value="dryer">Secadora</option>
                      <option value="iron">Plancha</option>
                    </optgroup>
                    <optgroup label="Entretenimiento">
                      <option value="tv">Televisor</option>
                      <option value="speaker">Parlante</option>
                      <option value="console">Consola de Videojuegos</option>
                      <option value="projector">Proyector</option>
                    </optgroup>
                    <optgroup label="Hogar">
                      <option value="lights">Luces</option>
                      <option value="fridge_small">Mini Refrigerador</option>
                      <option value="vacuum">Aspiradora</option>
                      <option value="printer">Impresora</option>
                      <option value="router">Router</option>
                      <option value="computer">Computadora</option>
                      <option value="laptop">Laptop</option>
                      <option value="monitor">Monitor</option>
                    </optgroup>
                    <optgroup label="Otro">
                      <option value="other">Otro</option>
                    </optgroup>
                  </select>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => {
                        setAddingDeviceLocationId(null);
                        setFoundDevice(null);
                      }}
                      className="px-3 py-2 rounded bg-white/5"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleRegisterDevice}
                      className="px-3 py-2 rounded bg-emerald-500"
                    >
                      Registrar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Delete Location Confirmation Modal */}
        {deletingLocationId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-sm rounded-xl bg-slate-800 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">
                Eliminar ubicación
              </h3>
              <p className="text-sm text-emerald-100 mb-6">
                ¿Estás seguro de que deseas eliminar esta ubicación? Esta acción no se puede deshacer.
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setDeletingLocationId(null)}
                  className="px-4 py-2 rounded bg-white/5 text-white hover:bg-white/10 transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleDeleteLocation(deletingLocationId)}
                  className="px-4 py-2 rounded bg-red-500/20 text-red-100 hover:bg-red-500/30 transition"
                >
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Location Error Modal (devices exist) */}
        {deleteLocationError && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-sm rounded-xl bg-slate-800 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">
                No se puede eliminar
              </h3>
              <p className="text-sm text-yellow-100 mb-6">
                {deleteLocationError.message}
              </p>
              <p className="text-xs text-emerald-100 mb-6">
                Ve a cada dispositivo en esta ubicación y selecciona "Mover a otra ubicación" o "Eliminar dispositivo".
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setDeleteLocationError(null)}
                  className="px-4 py-2 rounded bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30 transition"
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
