// App Shell / Navigation IA refactor (spec 0023). AppHeader is persistent
// above the routed content; AskWyskerProvider makes the global AI sheet
// openable from anywhere inside the shell, not just the header button
// (step 10 — PetProfileTabs' retiring "ai" tab also opens it).
import AppHeader from './AppHeader';
import BottomTabBar from './BottomTabBar';
import { AskWyskerProvider } from '@/lib/AskWyskerContext';

export default function AppShell({ children }) {
  return (
    <AskWyskerProvider>
      <AppHeader />
      {children}
      <BottomTabBar />
    </AskWyskerProvider>
  );
}
