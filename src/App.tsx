import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { authClient } from './lib/auth-client';
import { AuthPage } from './components/AuthPage';
import { Library } from './library/Library';
import { BillingPage, PricingPage } from './billing/BillingPage';
import { LegalPage } from './billing/LegalPage';
import { AdminPage } from './billing/AdminPage';
const PublicDocument = lazy(() =>
  import('./PublicDocument').then((m) => ({ default: m.PublicDocument })),
);
import { Workspace } from './components/Workspace';
const EditorPage = lazy(() =>
  import('./editor/EditorPage').then((module) => ({ default: module.EditorPage })),
);
const StudyPage = lazy(() => import('./study/StudyPage').then((m) => ({ default: m.StudyPage })));
const LegacyStudyRedirect = lazy(() =>
  import('./study/StudyPage').then((m) => ({ default: m.LegacyStudyRedirect })),
);
export function App() {
  const { data, isPending, error } = authClient.useSession();
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    if (!isPending) setBooted(true);
    let target: string | null = null;
    try {
      target = sessionStorage.getItem('bouche-copy-return');
    } catch {}
    if (data?.user && target && /^\/s\/[a-f0-9]{64}\/copy$/.test(target)) {
      try {
        sessionStorage.removeItem('bouche-copy-return');
      } catch {}
      if (location.pathname !== target) location.replace(target);
    }
  }, [isPending, data?.user?.id]);
  if (isPending && !booted) return <div className="app-loading">Ouverture de Bouche-trou…</div>;
  const user = data?.user;
  return (
    <>
      <Suspense fallback={<div className="app-loading">Ouverture de l’éditeur…</div>}>
        <Routes>
          <Route path="/s/:token" element={<PublicDocument user={user} />} />
          <Route path="/s/:token/copy" element={<PublicDocument user={user} copy />} />
          <Route path="/" element={user ? <Navigate to="/library" replace /> : <AuthPage />} />
          <Route path="/reset-password" element={<AuthPage />} />
          <Route
            path="/pricing"
            element={
              user ? (
                <Workspace user={user}>
                  <PricingPage />
                </Workspace>
              ) : (
                <PricingPage />
              )
            }
          />
          <Route
            path="/legal/:page"
            element={
              user ? (
                <Workspace user={user}>
                  <LegalPage />
                </Workspace>
              ) : (
                <LegalPage />
              )
            }
          />
          <Route
            path="/billing"
            element={
              user ? (
                <Workspace user={user}>
                  <BillingPage userId={user.id} />
                </Workspace>
              ) : (
                <AuthPage returnTo="/billing" />
              )
            }
          />
          <Route
            path="/admin"
            element={
              user ? (
                <Workspace user={user}>
                  <AdminPage userId={user.id} />
                </Workspace>
              ) : (
                <AuthPage returnTo="/admin" />
              )
            }
          />
          <Route
            path="/library"
            element={
              user ? (
                <Workspace user={user}>
                  <Library user={user} />
                </Workspace>
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/document/:id"
            element={
              user ? (
                <Workspace user={user}>
                  <EditorPage user={user} />
                </Workspace>
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
          <Route
            path="/study"
            element={
              user ? (
                <Workspace user={user}>
                  <StudyPage user={user} />
                </Workspace>
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/study/:id"
            element={
              user ? (
                <Workspace user={user}>
                  <StudyPage user={user} />
                </Workspace>
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/study/free/:id"
            element={
              user ? (
                <Workspace user={user}>
                  <LegacyStudyRedirect />
                </Workspace>
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route path="/study/session/:id" element={<Navigate to="/study" replace />} />
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
