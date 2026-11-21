import { useLocation, useNavigate } from 'react-router-dom';

// Back button that still goes somewhere when there's no in-app history
// (spec 0074). React Router gives the first page loaded in a tab the key
// 'default' (opened from the address bar, or in a new tab, as the signup
// screens' Terms/Privacy links do), and navigate(-1) does nothing there.
// A refresh keeps the page's own key, so normal Back still works after a
// reload. `replace` keeps the dead-end page out of the history.
export default function useBackWithFallback(fallbackPath) {
  const location = useLocation();
  const navigate = useNavigate();

  return () => {
    if (location.key === 'default') {
      navigate(fallbackPath, { replace: true });
    } else {
      navigate(-1);
    }
  };
}
