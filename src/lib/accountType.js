// Account-type helpers, operating on the merged user object from
// AuthContext (user.account_type comes from profiles.account_type).
//
// isDemoAdmin() intentionally checks role only, not account_type:
// curating the shared demo dataset is meant to be done by an
// authorized admin, not by anyone who simply holds the demo
// account's login credentials. isInternalAccount() below is the
// combined "may use the internal reset/seed tools" check: every
// test account qualifies, but a demo account only qualifies if it
// is ALSO flagged as admin (profiles.role = 'admin') — an explicit,
// auditable opt-in rather than something every demo login gets for
// free.

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

export function isInternalAccount(user) {
  return isTestAccount(user) || (isDemoAccount(user) && isDemoAdmin(user));
}
