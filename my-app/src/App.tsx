import { Route, Routes, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { WelcomePage } from "./pages/WelcomePage";
import { SummaryPage } from "./pages/SummaryPage";
import { GestionPage } from "./pages/GestionPage";
import { ApplianceDetailPage } from "./pages/ApplianceDetailPage";
import { ProtectedLayout } from "./layouts/ProtectedLayout";
import authService from "./api/auth";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";


function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<any | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const stored = authService.getStoredAuth();
    if (stored.token) {
      // verificar inactividad
      if (authService.isSessionExpired()) {
        authService.logout();
        setIsAuthenticated(false);
        setUser(null);
      } else {
        setIsAuthenticated(true);
        setUser(stored.user);
        authService.touchSession();
      }
    }

    // actualizar sesion en interaccion del usuario
    const touch = () => authService.touchSession();
    window.addEventListener('mousemove', touch);
    window.addEventListener('keydown', touch);
    window.addEventListener('click', touch);

    // verificacion periodica de inactividad
    const interval = setInterval(() => {
      if (authService.isSessionExpired()) {
        authService.logout();
        setIsAuthenticated(false);
        setUser(null);
      }
    }, 30 * 1000); // verificar cada 30s

    setAuthReady(true);

    return () => {
      window.removeEventListener('mousemove', touch);
      window.removeEventListener('keydown', touch);
      window.removeEventListener('click', touch);
      clearInterval(interval);
    };
  }, []);

  if (!authReady) return null;

  const handleEnterDashboard = (u: any) => {
    setIsAuthenticated(true);
    setUser(u);
  };

  const handleLogout = () => {
    authService.logout();
    setIsAuthenticated(false);
    setUser(null);
  };

  return (
    <Routes>
      {/* Rutas protegidas */}
      <Route
        element={isAuthenticated ? <ProtectedLayout onLogout={handleLogout} user={user} /> : <Navigate to="/login" replace />}
      >
        {/* ahora WelcomePage es protegida */}
        <Route path="/" element={<WelcomePage onNavigateToDashboard={() => console.log('Navigating to dashboard')} />} />

        <Route path="/resumen" element={<SummaryPage user={user} />} />
        <Route path="/gestion" element={<GestionPage user={user} />} />
        <Route path="/appliance/:applianceId" element={<ApplianceDetailPage user={user} />} />
      </Route>

      {/* login temporal (mientras lo implementas) */}
      <Route path="/login" element={<LoginPage onLogin={handleEnterDashboard} />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
