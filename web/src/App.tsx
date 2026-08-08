import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import Login from './pages/Login';
import Brand from './pages/Brand';
import Home from './pages/Home';
import Workspace from './pages/Workspace';
import Personas from './pages/Personas';
import Voices from './pages/Voices';
import Settings from './pages/Settings';
import AdminLogin from './pages/AdminLogin';
import Admin from './pages/Admin';
import SharingSquare from './pages/SharingSquare';
import SharedBook from './pages/SharedBook';

function Protected({ children }: { children: React.ReactElement }) {
  const { token } = useAuth();
  return token ? children : <Navigate to="/login" replace />;
}

// 根路径：已登录 → 工作台（Home），未登录 → 品牌页
function HomeOrBrand() {
  const { token } = useAuth();
  return token ? <Home /> : <Brand />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/" element={<HomeOrBrand />} />
        <Route path="/shares" element={<SharingSquare />} />
        <Route path="/shares/:id" element={<SharedBook />} />
        <Route path="/workspace" element={<Protected><Workspace /></Protected>} />
        <Route path="/personas" element={<Protected><Personas /></Protected>} />
        <Route path="/voices" element={<Protected><Voices /></Protected>} />
        <Route path="/settings" element={<Protected><Settings /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
