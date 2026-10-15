import { Component, type ReactNode } from 'react';
import { FlaskConical, RotateCcw } from 'lucide-react';

/** A failed lazy chunk or render must not leave a blank screen or clear local drafts. */
export class RecoveryBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="app-loading recovery-screen" role="alert">
        <FlaskConical size={36} aria-hidden="true" />
        <h1>Reprenons l’expérience.</h1>
        <p>
          L’interface n’a pas pu se charger. Recharger la page ne supprime pas vos copies locales de
          récupération.
        </p>
        <button className="button primary" onClick={() => window.location.reload()}>
          <RotateCcw size={16} /> Recharger la page
        </button>
        <a className="back-link" href="/library">
          Revenir à la bibliothèque
        </a>
      </main>
    );
  }
}
