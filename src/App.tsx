import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { authClient } from './lib/auth-client';
import { AuthPage } from './components/AuthPage';
import { Library } from './library/Library';
const EditorPage = lazy(() =>
  import('./editor/EditorPage').then((module) => ({ default: module.EditorPage })),
);
const StudyPage = lazy(() => import('./study/StudyPage').then((m) => ({ default: m.StudyPage })));
const FreeStudyPage = lazy(() =>
  import('./study/StudyPage').then((m) => ({ default: m.FreeStudyPage })),
);
const ScheduledStudyPage = lazy(() =>
  import('./study/StudyPage').then((m) => ({ default: m.ScheduledStudyPage })),
);
export function App() {
  const { data, isPending, error } = authClient.useSession();
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    if (!isPending) setBooted(true);
  }, [isPending]);
  if (isPending && !booted) return <div className="app-loading">Ouverture du laboratoire…</div>;
  const user = data?.user;
  return (
    <>
      <Suspense fallback={<div className="app-loading">Ouverture de l’éditeur…</div>}>
        <Routes>
          <Route path="/" element={user ? <Navigate to="/library" replace /> : <AuthPage />} />
          <Route path="/reset-password" element={<AuthPage />} />
          <Route
            path="/library"
            element={user ? <Library user={user} /> : <Navigate to="/" replace />}
          />
          <Route
            path="/document/:id"
            element={user ? <EditorPage user={user} /> : <Navigate to="/" replace />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
          <Route
            path="/study"
            element={user ? <StudyPage user={user} /> : <Navigate to="/" replace />}
          />
          <Route
            path="/study/free/:id"
            element={user ? <FreeStudyPage user={user} /> : <Navigate to="/" replace />}
          />
          <Route
            path="/study/session/:id"
            element={user ? <ScheduledStudyPage user={user} /> : <Navigate to="/" replace />}
          />
        </Routes>
      </Suspense>
      {error && user && (
        <p className="connection-warning">
          La session ne peut plus être vérifiée. Vos copies locales restent disponibles.
        </p>
      )}
    </>
  );
}
