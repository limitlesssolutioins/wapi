import { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { api } from '../services/api';

interface AuthContextType {
    token: string | null;
    isAuthenticated: boolean;
    login: (token: string) => void;
    logout: () => void;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [token, setToken] = useState<string | null>(localStorage.getItem('authToken'));
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const storedToken = localStorage.getItem('authToken');
        if (storedToken) {
            setToken(storedToken);
            api.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
        }
        setIsLoading(false);
    }, []);

    const login = (newToken: string) => {
        setToken(newToken);
        localStorage.setItem('authToken', newToken);
        api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    };

    const logout = () => {
        setToken(null);
        localStorage.removeItem('authToken');
        delete api.defaults.headers.common['Authorization'];
    };

    return (
        <AuthContext.Provider value={{
            token,
            isAuthenticated: !!token,
            login,
            logout,
            isLoading
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
