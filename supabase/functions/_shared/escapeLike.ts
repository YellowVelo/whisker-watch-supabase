// Escapes a value for an exact, case-insensitive match with PostgREST's
// .ilike() (spec 0077). Without this, a % or _ in an email address would act
// as a wildcard and could match someone else's invite row.
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
