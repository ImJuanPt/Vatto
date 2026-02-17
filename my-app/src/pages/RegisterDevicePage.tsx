import { useState, useEffect } from "react";
import { Navbar } from "../components/NavBar";
import { User } from "../types/user";
import { getLocations } from "../api/locations";
import { Location } from "../types/location";
import api from "../api/client";

interface RegisterDevicePageProps {
  user: User;
  onLogout?: () => void;
  onNavigate?: (page: string) => void;
}

export function RegisterDevicePage({ user, onLogout, onNavigate }: RegisterDevicePageProps) {
  const [step, setStep] = useState<"select_location" | "device_details" | "pairing_code">(
    "select_location"
  );
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
  const [deviceName, setDeviceName] = useState("");
  const [deviceType, setDeviceType] = useState("other");
  const [pairingCode, setPairingCode] = useState("");
  const [maxWatts, setMaxWatts] = useState(1000);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadLocations();
  }, []);

  const loadLocations = async () => {
    try {
      const locs = await getLocations();
      setLocations(locs);
      if (locs.length > 0) {
        setSelectedLocationId(Number(locs[0].id));
      }
    } catch (err) {
      console.error("Failed to load locations", err);
    }
  };

  const handleSelectLocation = () => {
    if (!selectedLocationId) {
      setError("Selecciona una ubicación");
      return;
    }
    setError("");
    setStep("device_details");
  };

  const handleCreateDevice = async () => {
    if (!deviceName || !deviceType) {
      setError("Completa todos los campos");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Call backend to create device
      const newDevice = await api.post<any>('/v1/devices', {
        locationId: selectedLocationId!,
        name: deviceName,
        deviceType: deviceType,
        maxWattsThreshold: maxWatts,
      });

      // Generar código de pairing de 6 dígitos
      const code = String(Math.floor(Math.random() * 1000000)).padStart(6, "0");
      setPairingCode(code);

      console.log(`Dispositivo creado (ID: ${newDevice.id}) - Código: ${code}`);

      setStep("pairing_code");
    } catch (err) {
      setError("Error creando dispositivo");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const copyPairingCode = () => {
    navigator.clipboard.writeText(pairingCode);
    alert("Código copiado al portapapeles");
  };

  return (
    <main className="min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <Navbar user={user} onLogout={onLogout} onNavigate={() => {}} />

      <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">Registrar Nuevo Dispositivo</h1>
          <p className="text-slate-400">
            {step === "select_location" && "Paso 1: Selecciona la ubicación"}
            {step === "device_details" && "Paso 2: Ingresa los detalles del dispositivo"}
            {step === "pairing_code" && "Paso 3: Empareja tu ESP32"}
          </p>
        </header>

        {error && (
          <div className="rounded-lg border border-red-400/30 bg-red-400/10 p-4 text-red-200">
            {error}
          </div>
        )}

        {/* PASO 1: Seleccionar Ubicación */}
        {step === "select_location" && (
          <div className="space-y-6 rounded-2xl border border-white/10 bg-white/10 p-6">
            <div>
              <label className="block text-sm font-semibold text-emerald-200 mb-3">
                Selecciona una ubicación
              </label>
              <div className="space-y-2">
                {locations.map((loc) => (
                  <button
                    key={loc.id}
                    onClick={() => setSelectedLocationId(Number(loc.id))}
                    className={`w-full rounded-lg border-2 p-4 text-left transition-all ${
                      selectedLocationId === Number(loc.id)
                        ? "border-emerald-500 bg-emerald-500/20"
                        : "border-white/10 bg-white/5 hover:border-emerald-500/50"
                    }`}
                  >
                    <p className="font-semibold">{loc.name}</p>
                    <p className="text-sm text-slate-400">{loc.address}</p>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleSelectLocation}
              className="rounded-lg bg-emerald-500 px-6 py-3 font-semibold text-white transition-all hover:bg-emerald-400"
            >
              Continuar
            </button>
          </div>
        )}

        {/* PASO 2: Detalles del Dispositivo */}
        {step === "device_details" && (
          <div className="space-y-6 rounded-2xl border border-white/10 bg-white/10 p-6">
            <div>
              <label className="block text-sm font-semibold text-emerald-200 mb-2">
                Nombre del dispositivo
              </label>
              <input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="Ej: Nevera de la cocina"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-emerald-200 mb-2">
                Tipo de dispositivo
              </label>
              <select
                value={deviceType}
                onChange={(e) => setDeviceType(e.target.value)}
                className="w-full rounded-lg border border-slate-600 bg-slate-700 px-4 py-3 text-white focus:border-emerald-500 focus:outline-none"
              >
                <optgroup label="Cocina">
                  <option value="refrigerador">Refrigerador</option>
                  <option value="horno">Horno</option>
                  <option value="microondas">Microondas</option>
                  <option value="lavavajillas">Lavavajillas</option>
                  <option value="cafetera">Cafetera</option>
                  <option value="licuadora">Licuadora</option>
                  <option value="tostadora">Tostadora</option>
                </optgroup>
                <optgroup label="Clima">
                  <option value="aire_acondicionado">Aire Acondicionado</option>
                  <option value="calefactor">Calefactor</option>
                  <option value="ventilador">Ventilador</option>
                  <option value="termostato">Termostato</option>
                </optgroup>
                <optgroup label="Lavandería">
                  <option value="lavadora">Lavadora</option>
                  <option value="secadora">Secadora</option>
                  <option value="plancha">Plancha</option>
                </optgroup>
                <optgroup label="Entretenimiento">
                  <option value="televisor">Televisor</option>
                  <option value="parlante">Parlante</option>
                  <option value="consola">Consola de Videojuegos</option>
                  <option value="proyector">Proyector</option>
                </optgroup>
                <optgroup label="Hogar">
                  <option value="luces">Luces</option>
                  <option value="mini_refrigerador">Mini Refrigerador</option>
                  <option value="aspiradora">Aspiradora</option>
                  <option value="impresora">Impresora</option>
                  <option value="router">Router</option>
                  <option value="computadora">Computadora</option>
                  <option value="laptop">Laptop</option>
                  <option value="monitor">Monitor</option>
                </optgroup>
                <optgroup label="Otro">
                  <option value="other">Otro</option>
                </optgroup>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-emerald-200 mb-2">
                Potencia máxima (watts)
              </label>
              <input
                type="number"
                value={maxWatts}
                onChange={(e) => setMaxWatts(Number(e.target.value))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep("select_location")}
                className="rounded-lg border border-white/10 px-6 py-3 font-semibold text-white transition-all hover:bg-white/5"
              >
                Volver
              </button>
              <button
                onClick={handleCreateDevice}
                disabled={loading}
                className="flex-1 rounded-lg bg-emerald-500 px-6 py-3 font-semibold text-white transition-all hover:bg-emerald-400 disabled:opacity-50"
              >
                {loading ? "Creando..." : "Crear Dispositivo"}
              </button>
            </div>
          </div>
        )}

        {/* PASO 3: Código de Pairing */}
        {step === "pairing_code" && (
          <div className="space-y-6 rounded-2xl border border-white/10 bg-white/10 p-6">
            <div className="text-center">
              <h2 className="text-xl font-bold text-emerald-200 mb-4">
                Código de Emparejamiento
              </h2>
              <div className="relative">
                <div className="rounded-lg border-2 border-emerald-500 bg-emerald-500/20 p-6 mb-4">
                  <p className="text-5xl font-mono font-bold text-emerald-300 tracking-widest">
                    {pairingCode}
                  </p>
                </div>
                <button
                  onClick={copyPairingCode}
                  className="w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400"
                >
                  Copiar Código
                </button>
              </div>

              <div className="mt-8 space-y-4 text-left">
                <h3 className="font-bold text-lg">Pasos para configurar tu ESP32:</h3>
                <ol className="space-y-3 text-sm text-slate-300">
                  <li className="flex gap-3">
                    <span className="shrink-0 rounded-full bg-emerald-500 w-6 h-6 flex items-center justify-center text-white font-bold">
                      1
                    </span>
                    <span>Sube este código al ESP32 y reinicia</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="shrink-0 rounded-full bg-emerald-500 w-6 h-6 flex items-center justify-center text-white font-bold">
                      2
                    </span>
                    <span>Abre el Serial Monitor a 115200 baud</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="shrink-0 rounded-full bg-emerald-500 w-6 h-6 flex items-center justify-center text-white font-bold">
                      3
                    </span>
                    <span>Ingresa en la terminal: TuSSID|TuPassword|{pairingCode}</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="shrink-0 rounded-full bg-emerald-500 w-6 h-6 flex items-center justify-center text-white font-bold">
                      4
                    </span>
                    <span>El ESP32 se configurará automáticamente y comenzará a enviar datos</span>
                  </li>
                </ol>
              </div>
            </div>

            <button
              onClick={() => {
                setStep("select_location");
                setDeviceName("");
                setPairingCode("");
              }}
              className="w-full rounded-lg bg-emerald-500 px-6 py-3 font-semibold text-white transition-all hover:bg-emerald-400"
            >
              Registrar Otro Dispositivo
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
