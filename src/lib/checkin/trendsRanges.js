// Trends range options and their lookback days. Kept in their own
// import-free file so src/lib/aiServerParity.test.js can compare them with
// ask-vet-assistant's TRENDS_RANGES without loading the Supabase client.
// trendsClient.js re-exports both.
//
// daily_check_ins is one row per calendar day, so a literal "24 hours" has
// no meaning; 24H is treated as a short trailing window for chart context.
export const RANGE_DAYS = { '24H': 5, '7D': 7, '30D': 30, '90D': 90, '1Y': 365 };
export const RANGE_OPTIONS = ['24H', '7D', '30D', '90D', '1Y'];
