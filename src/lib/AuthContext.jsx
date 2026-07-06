import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';

const AuthContext = createContext();

/**
 * Supabase-backed replacement for the old Base44 AuthContext.
 *
 * Keeps the exact same shape consumers rely on (useAuth() ->
 * { user, isAuthenticated, isLoadingAuth, authError, authChecked,
 *   logout, navigateToLogin, checkUserAuth, ... }) so ProtectedRoute.jsx
 * and App.jsx don't need to change.
 *
 * "user" now includes the merged profiles row (role, etc.) alongside
 * the base Supabase auth user (id, email).
 *
 * Note: there's no more "app public settings" / "user not registered"
 * concept (that was a Base44-specific multi-tenant thing). authError
 * is kept for shape-compatibility but will rarely be set now — auth
 * failures mostly show up as isAuthenticated=false.
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  // Distinct from authError: the session is valid but the profiles row
  // fetch itself failed (e.g. a network hiccup), so consumers can show a
  // "your account info didn't load" retry instead of treating it as
  // logged-out.
  const [profileLoadError, setProfileLoadError] = useState(false);

  useEffect(() => {
    checkUserAuth();

    // Keep state in sync if the user logs in/out in another tab,
    // or when a session refreshes/expires.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadUserWithProfile(session.user);
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
    });

    return () => {
      listener?.subscription?.unsubscribe();
    };
  }, []);

  const loadUserWithProfile = async (authUser) => {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single();

    setProfileLoadError(!!error);
    setUser({
      id: authUser.id,
      email: authUser.email,
      role: profile?.role || 'user',
      ...profile,
    });
    setIsAuthenticated(true);
  };

  const checkUserAuth = async () => {
    setIsLoadingAuth(true);
    setAuthError(null);
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user) {
        setUser(null);
        setIsAuthenticated(false);
      } else {
        await loadUserWithProfile(data.user);
      }
    } catch (error) {
      console.error('User auth check failed:', error);
      setAuthError({ type: 'unknown', message: error.message || 'Failed to check auth' });
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setIsAuthenticated(false);
    window.location.href = '/login';
  };

  const navigateToLogin = () => {
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      // Compatibility alias: Base44 had a separate "public settings" load
      // step that no longer exists with Supabase. App.jsx still checks
      // this flag, so we mirror isLoadingAuth here rather than touching
      // every consumer right now.
      isLoadingPublicSettings: isLoadingAuth,
      authError,
      authChecked,
      profileLoadError,
      logout,
      navigateToLogin,
      checkUserAuth,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
