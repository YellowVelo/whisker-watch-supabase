// Account-type helpers, operating on the merged user object from
// AuthContext (user.account_type comes from profiles.account_type).
//
// isDemoAdmin() intentionally checks role only, not account_type:
// Demo Admin Mode (Phase 3) is meant to be used by an authorized
// admin curating the shared demo dataset, not by someone logged
// into the demo account itself.

export function isProductionAccount(user) {
  return (user?.account_type ?? 'production') === 'production';
}

export function isTestAccount(user) {
  return user?.account_type === 'test';
}

export function isDemoAccount(user) {
  return user?.account_type === 'demo';
}

export function isDemoAdmin(user) {
  return user?.role === 'admin';
}
