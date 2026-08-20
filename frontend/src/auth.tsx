import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, post } from './api';
import type { User } from './types';

type AuthValue = { user:User|null; loading:boolean; emailConfigured:boolean; refresh:()=>Promise<void>; logout:()=>Promise<void> };
const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({children}:{children:ReactNode}) {
  const [user,setUser] = useState<User|null>(null);
  const [loading,setLoading] = useState(true);
  const [emailConfigured,setEmailConfigured] = useState(false);
  const refresh = async () => {
    try { const data = await api<{user:User|null;emailConfigured:boolean}>('/api/auth/me'); setUser(data.user); setEmailConfigured(data.emailConfigured); }
    finally { setLoading(false); }
  };
  useEffect(()=>{ void refresh(); },[]);
  const logout = async () => { await post('/api/auth/logout'); setUser(null); };
  const value = useMemo(()=>({user,loading,emailConfigured,refresh,logout}),[user,loading,emailConfigured]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(){ const value=useContext(AuthContext); if(!value) throw new Error('AuthProvider missing'); return value; }
