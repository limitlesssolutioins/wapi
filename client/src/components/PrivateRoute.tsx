import { useAuth } from '../services/AuthContext';
import { Navigate, Outlet } from 'react-router-dom';

const PrivateRoute = () => {
    const { isAuthenticated, isLoading } = useAuth();

    if (isLoading) {
        // You can render a loading spinner here
        return <div>Loading...</div>;
    }

    return isAuthenticated ? <Outlet /> : <Navigate to="/login" />;
};

export default PrivateRoute;
