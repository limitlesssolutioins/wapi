import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom';
import Layout from './layouts/Layout';
import DashboardHome from './pages/DashboardHome';
import DeviceManager from './pages/DeviceManager';
import Campaigns from './pages/Campaigns';
import Contacts from './pages/Contacts';
import Settings from './pages/Settings';
import Inbox from './pages/Inbox';
import Login from './pages/Login';
import { AuthProvider, useAuth } from './services/AuthContext';
import { Navigate } from 'react-router-dom';

// Wrapper to handle auth logic
const AppWrapper = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div>Loading session...</div>; // Or a proper splash screen
  }

  return (
    <Routes>
      <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to="/" />} />
      <Route 
        path="/" 
        element={isAuthenticated ? <Layout /> : <Navigate to="/login" />}
      >
        <Route index element={<DashboardHome />} />
        <Route path="inbox" element={<Inbox />} />
        <Route path="devices" element={<DeviceManager />} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="contacts" element={<Contacts />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppWrapper />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
