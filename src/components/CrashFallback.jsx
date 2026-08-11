import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Shown by Sentry's ErrorBoundary (see App.jsx) when a render error is
// caught, instead of the blank white screen a crash produced before spec
// 0052. Modeled on PageNotFound.jsx's layout for a consistent "something's
// wrong, here's a clear way back" pattern.
export default function CrashFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-md w-full">
        <div className="text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-primary" />
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-2xl font-semibold text-foreground">
              Something went wrong
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              We hit an unexpected error. Try going back home — if it keeps happening, let us know from the Support page.
            </p>
          </div>

          <div className="pt-6">
            <Button onClick={() => { window.location.href = '/'; }}>
              Go Home
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
