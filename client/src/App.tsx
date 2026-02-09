import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './layouts/Layout';
import DashboardHome from './pages/DashboardHome';
import DeviceManager from './pages/DeviceManager';
import Campaigns from './pages/Campaigns';
import Contacts from './pages/Contacts';
import Settings from './pages/Settings';
import Inbox from './pages/Inbox';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<DashboardHome />} />
          <Route path="inbox" element={<Inbox />} />
          <Route path="devices" element={<DeviceManager />} />
          <Route path="campaigns" element={<Campaigns />} />
          <Route path="contacts" element={<Contacts />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
