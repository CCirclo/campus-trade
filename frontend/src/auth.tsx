import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, post } from './api';
import type { School, User } from './types';

type AuthValue = { user:User|null; schools:School[]; defaultScope:{schoolId:string;campusId:string}|null; loading:boolean; emailConfigured:boolean; refresh:()=>Promise<void>; logout:()=>Promise<void> };
const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({children}:{children:ReactNode}) {
  const [user,setUser] = useState<User|null>(null);
  const [loading,setLoading] = useState(true);
  const [emailConfigured,setEmailConfigured] = useState(false);
  const [schools,setSchools]=useState<School[]>([]);
  const [defaultScope,setDefaultScope]=useState<{schoolId:string;campusId:string}|null>(null);
  const refresh = async () => {
    try { const [data,catalog] = await Promise.all([api<{user:User|null;emailConfigured:boolean}>('/api/auth/me'),api<{schools:School[];default:{schoolId:string;campusId:string}}>('/api/campuses')]); setUser(data.user); setEmailConfigured(data.emailConfigured);setSchools(catalog.schools);setDefaultScope(catalog.default); }
    finally { setLoading(false); }
  };
  useEffect(()=>{ void refresh(); },[]);
  const logout = async () => { await post('/api/auth/logout'); setUser(null); };
  const value = useMemo(()=>({user,schools,defaultScope,loading,emailConfigured,refresh,logout}),[user,schools,defaultScope,loading,emailConfigured]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(){ const value=useContext(AuthContext); if(!value) throw new Error('AuthProvider missing'); return value; }
