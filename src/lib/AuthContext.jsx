import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { supabase } from '@/api/supabaseClient';
import { entities } from '@/api/entities';
import { detectTimezone, shouldAutoPopulateTimezone } from '@/lib/timezone';
import { track } from '@/lib/analytics';
import { setSentryAccountType, clearSentryAccountType, reportClientError } from '@/lib/errorMonitoring';
import { shouldRedirectToReset, RESET_PASSWORD_PATH } from '@/lib/passwordRecovery';

const AuthContext = createContext(undefined);

/**
 * The app's sign-in state, backed by Supabase Auth.
 *
 * useAuth() returns { user, isAuthenticated, isLoadingAuth, authError,
 * authChecked, profileLoadError, logout, checkUserAuth, refreshProfile }.
 *
 * "user" is the Supabase auth user (id, email) merged with that
 * person's profiles row (role, account_type, timezone, etc.).
 *
 * authError is set only to { type: 'unknown', message } when the
 * session check itself throws; ProtectedRoute treats it like being
 * signed out. An ordinary missing or expired session shows up as
 * isAuthenticated=false with no authError.
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
  // supabase-js fires onAuthStateChange immediately for an existing
  // session (in addition to the mount-time checkUserAuth() call), so
  // two overlapping loadUserWithProfile calls for the same user are
  // routine on first load. Without de-duping, both can read
  // timezone IS NULL before either write lands, causing a double
  // timezone auto-detect write (and a duplicate timezone_auto_detected
  // event). Keyed by user id so concurrent calls for the same user
  // share one in-flight request instead of racing.
  const loadInFlightRef = useRef(new Map());
  // Fires 'app_opened' once per page load, the first time we resolve an
  // authenticated user — whether that's an existing session found on
  // mount or a fresh sign-in. Guards against onAuthStateChange firing
  // again later (token refresh, etc.) and inflating visit counts.
  const appOpenedTrackedRef = useRef(false);

  useEffect(() => {
    checkUserAuth();

    // Keep state in sync if the user logs in/out in another tab,
    // or when a session refreshes/expires.
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      // Spec 0074: a reset-link login that landed anywhere but
      // /reset-password goes there. A full-page replace, because
      // AuthProvider sits above <Router> (App.jsx); the session is already
      // saved, so the reload finds it. supabase-js announces
      // PASSWORD_RECOVERY only after verifying the link's token over the
      // network, so this listener is registered well before it fires.
      if (shouldRedirectToReset(event, window.location.pathname)) {
        window.location.replace(RESET_PASSWORD_PATH);
        return;
      }
      if (session?.user) {
        loadUserWithProfile(session.user);
      } else {
        setUser(null);
        setIsAuthenticated(false);
        clearSentryAccountType();
      }
    });

    return () => {
      listener?.subscription?.unsubscribe();
    };
  }, []);

  const loadUserWithProfile = (authUser) => {
    const key = authUser.id;
    const existing = loadInFlightRef.current.get(key);
    if (existing) return existing;

    const promise = doLoadUserWithProfile(authUser).finally(() => {
      loadInFlightRef.current.delete(key);
    });
    loadInFlightRef.current.set(key, promise);
    return promise;
  };

  const doLoadUserWithProfile = async (authUser) => {
    // Link any co-owner invites sent to this email before an account
    // existed (or before this device's last login) to this user, so
    // shared pets actually become visible and delete-pet's ownership
    // transfer can find them. Safe to call every time — it's a no-op
    // once already linked.
    const { error: claimError } = await supabase.rpc('claim_pending_co_owner_invites');
    if (claimError) {
      reportClientError(claimError, { feature: 'auth', note: 'Failed to link pending co-owner invites' });
    }

    // Same linking step for sitter invites — links pet_sitter_access.
    // sitter_user_id so an invited sitter can actually log entries for
    // the pet-sit, not just see that they've been granted access.
    const { error: sitterClaimError } = await supabase.rpc('claim_pending_sitter_invites');
    if (sitterClaimError) {
      reportClientError(sitterClaimError, { feature: 'auth', note: 'Failed to link pending sitter invites' });
    }

    let { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single();

    // First authenticated load with no stored timezone: capture the
    // device/browser timezone (no location permission involved) and
    // persist it. Never runs again once a timezone is stored — manual
    // or auto — per the "auto-detection never overwrites" rule.
    if (profile && shouldAutoPopulateTimezone(profile)) {
      const detected = detectTimezone();
      if (detected) {
        const { data: updated, error: updateError } = await supabase
          .from('profiles')
          .update({ timezone: detected, timezone_is_manual: false })
          .eq('id', authUser.id)
          .select()
          .single();
        if (!updateError) {
          profile = updated;
          track('timezone_auto_detected', { timezone: detected });
        } else {
          track('timezone_detection_failed', { reason: updateError.message });
        }
      } else {
        track('timezone_detection_failed', { reason: 'unavailable' });
      }
    }

    setProfileLoadError(!!error);
    setUser({
      id: authUser.id,
      email: authUser.email,
      role: profile?.role || 'user',
      ...profile,
    });
    setIsAuthenticated(true);
    // account_type gates whether this user's errors reach Sentry (spec
    // 0052) — same "not a real user" default analytics.js uses.
    setSentryAccountType(profile?.account_type ?? 'production');
    if (!appOpenedTrackedRef.current) {
      appOpenedTrackedRef.current = true;
      track('app_opened', {});
    }
  };

  // Re-fetches the profiles row and merges it into `user`, without
  // re-running the co-owner-invite claim or timezone auto-detection —
  // used after the owner saves changes in Profile Settings so the rest
  // of the app (Menu's name display, etc.) reflects the edit immediately.
  const refreshProfile = async () => {
    const { data: authData } = await supabase.auth.getUser();
    const authUser = authData?.user;
    if (!authUser) return;
    const profile = await entities.Profile.get(authUser.id);
    setUser((prev) => ({ ...prev, ...profile }));
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
      reportClientError(error, { feature: 'auth', note: 'User auth check failed' });
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
    clearSentryAccountType();
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      authError,
      authChecked,
      profileLoadError,
      logout,
      checkUserAuth,
      refreshProfile,
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
