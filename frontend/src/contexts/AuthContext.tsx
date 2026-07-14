import React, {
  useEffect,
  useState,
  createContext,
  useContext,
  type ReactNode
} from 'react';
import { apiRequest, setToken } from '../lib/api';
import { disconnectEcho } from '../lib/realtime';

export type RoleName = 'patient' | 'doctor' | 'operator' | 'coordinator' | 'admin';
export type Role = RoleName | null;
export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  status?: string;
  roles: RoleName[];
  active_role: RoleName;
  role: RoleName;
  profiles?: Record<string, unknown>;
  avatar?: string;
}
export interface OtpRequiredError extends Error {
  devOtp?: string | null;
  otpMode?: 'email_verification' | 'login_2fa';
}
export type AccountType = 'patient' | 'doctor' | 'operator';
export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  password_confirmation: string;
  phone?: string;
  account_type?: AccountType;
  specialty_id?: number;
  license_number?: string;
  region?: string;
  referral_code?: string;
}
interface AuthContextType {
  user: User | null;
  role: Role;
  roles: RoleName[];
  login: (email: string, password: string) => Promise<User>;
  register: (payload: RegisterPayload) => Promise<{message: string; email: string; account_type?: string; requires_approval?: boolean; verification_required: boolean; dev_otp?: string | null}>;
  verifyEmailOtp: (email: string, code: string) => Promise<User>;
  verifyLoginOtp: (email: string, code: string) => Promise<User>;
  resendEmailOtp: (email: string) => Promise<{message: string; dev_otp?: string | null}>;
  switchRole: (role: RoleName) => Promise<void>;
  refreshUser: () => Promise<User | null>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);
export function AuthProvider({ children }: {children: ReactNode;}) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const normalizeUser = (apiUser: User): User => ({
    ...apiUser,
    role: apiUser.active_role
  });

  useEffect(() => {
    apiRequest<{user: User}>('/auth/me')
      .then((response) => setUser(normalizeUser(response.user)))
      .catch(() => setToken(null))
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const response = await apiRequest<{token?: string; user?: User; login_otp_required?: boolean; email_verification_required?: boolean; message?: string; dev_otp?: string | null}>('/auth/login', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ email, password })
    });

    if (response.email_verification_required) {
      const error = new Error(response.message || 'Emailul trebuie verificat.') as OtpRequiredError;
      error.name = 'EmailVerificationRequired';
      error.devOtp = response.dev_otp || null;
      error.otpMode = 'email_verification';
      throw error;
    }

    if (response.login_otp_required) {
      const error = new Error(response.message || 'Cod 2FA trimis.') as OtpRequiredError;
      error.name = 'LoginOtpRequired';
      error.devOtp = response.dev_otp || null;
      error.otpMode = 'login_2fa';
      throw error;
    }

    if (!response.token || !response.user) {
      throw new Error('Nu am putut autentifica utilizatorul.');
    }

    setToken(response.token);
    const nextUser = normalizeUser(response.user);
    setUser(nextUser);
    return nextUser;
  };

  const register = async (payload: RegisterPayload) => {
    return apiRequest<{message: string; email: string; account_type?: string; requires_approval?: boolean; verification_required: boolean; dev_otp?: string | null}>('/auth/register', {
      method: 'POST',
      auth: false,
      body: JSON.stringify(payload)
    });
  };

  const verifyEmailOtp = async (email: string, code: string) => {
    const response = await apiRequest<{token: string; user: User}>('/auth/verify-email-otp', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ email, code })
    });

    setToken(response.token);
    const nextUser = normalizeUser(response.user);
    setUser(nextUser);
    return nextUser;
  };

  const verifyLoginOtp = async (email: string, code: string) => {
    const response = await apiRequest<{token: string; user: User}>('/auth/verify-login-otp', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ email, code })
    });

    setToken(response.token);
    const nextUser = normalizeUser(response.user);
    setUser(nextUser);
    return nextUser;
  };

  const resendEmailOtp = async (email: string) => {
    return apiRequest<{message: string; dev_otp?: string | null}>('/auth/resend-email-otp', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ email })
    });
  };

  const switchRole = async (role: RoleName) => {
    const response = await apiRequest<{user: User}>('/auth/switch-role', {
      method: 'POST',
      body: JSON.stringify({ role })
    });
    setUser(normalizeUser(response.user));
  };

  const refreshUser = async () => {
    try {
      const response = await apiRequest<{user: User}>('/auth/me');
      const nextUser = normalizeUser(response.user);
      setUser(nextUser);
      return nextUser;
    } catch {
      return null;
    }
  };

  const logout = async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } finally {
      disconnectEcho();
      setToken(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role || null,
        roles: user?.roles || [],
        login,
        register,
        verifyEmailOtp,
        verifyLoginOtp,
        resendEmailOtp,
        switchRole,
        refreshUser,
        logout,
        isAuthenticated: !!user,
        isLoading
      }}>
      
      {children}
    </AuthContext.Provider>);

}
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
