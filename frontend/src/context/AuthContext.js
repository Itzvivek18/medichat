import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';

// Create Auth Context
const AuthContext = createContext(null);

// Hugging Face Backend URL
const API_URL =
  process.env.REACT_APP_API_URL ||
  'https://vivekumar454-medichat-backend.hf.space';

// Auth Provider
export function AuthProvider({ children }) {
  // States
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load saved auth data
  useEffect(() => {
    const storedToken = localStorage.getItem(
      'medichat_token'
    );

    const storedUser = localStorage.getItem(
      'medichat_user'
    );

    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } catch (error) {
        console.error('Invalid local storage data');

        localStorage.removeItem('medichat_token');
        localStorage.removeItem('medichat_user');
      }
    }

    setLoading(false);
  }, []);

  // Login Function
  const login = (userData, authToken) => {
    setUser(userData);
    setToken(authToken);

    localStorage.setItem(
      'medichat_token',
      authToken
    );

    localStorage.setItem(
      'medichat_user',
      JSON.stringify(userData)
    );
  };

  // Logout Function
  const logout = () => {
    setUser(null);
    setToken(null);

    localStorage.removeItem('medichat_token');
    localStorage.removeItem('medichat_user');
  };

  // API Call Function
  const apiCall = async (
    path,
    options = {}
  ) => {
    try {
      const response = await fetch(
        `${API_URL}${path}`,
        {
          ...options,

          headers: {
            'Content-Type':
              'application/json',

            ...(token
              ? {
                  Authorization: `Bearer ${token}`,
                }
              : {}),

            ...options.headers,
          },
        }
      );

      // Auto logout if unauthorized
      if (response.status === 401) {
        logout();

        throw new Error(
          'Session expired. Please login again.'
        );
      }

      // Handle API errors
      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({
            detail: 'Request failed',
          }));

        throw new Error(
          errorData.detail ||
            'Something went wrong'
        );
      }

      // Safe JSON parsing
      const text = await response.text();

      return text
        ? JSON.parse(text)
        : {};
    } catch (error) {
      console.error(
        'API Error:',
        error.message
      );

      throw error;
    }
  };

  // Context Value
  const value = {
    user,
    token,
    loading,
    login,
    logout,
    apiCall,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom Hook
export const useAuth = () => {
  return useContext(AuthContext);
};
