// Home's time-of-day greeting (Home Feature Spec #1). Pure and
// standalone so the morning/afternoon/evening boundaries are unit
// testable without rendering the page.
export function greetingForHour(hour) {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// Falls back to the unadorned greeting when no first name is on file
// (Home Feature Spec #1: "If first name is unavailable: Good morning").
export function buildGreeting(firstName, hour = new Date().getHours()) {
  const base = greetingForHour(hour);
  return firstName ? `${base}, ${firstName}` : base;
}
