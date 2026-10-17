import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  Sparkles,
  Clock3,
  Trash2,
  Settings,
  Menu,
  X,
  CreditCard,
  LogOut,
  LockKeyhole,
} from 'lucide-react';
import { Brand } from './Brand';
import { Modal } from './Modal';
import { api, json } from '../lib/api';
import { authClient } from '../lib/auth-client';

type User = { id: string; name: string; email: string };
type Guard = () => Promise<boolean>;
const Context = createContext<{
  navigate: (to: string) => Promise<void>;
  registerGuard: (guard: Guard) => () => void;
  focusMode: boolean;
  setFocusMode: (value: boolean) => void;
} | null>(null);
export function useWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error('Espace de travail absent.');
  return value;
}
export function Workspace({ user, children }: { user: User; children: ReactNode }) {
  const navigate = useNavigate(),
    location = useLocation(),
    client = useQueryClient();
  const guard = useRef<Guard | null>(null);
  useEffect(() => {
    const close = (event: Event) => {
      for (const menu of document.querySelectorAll<HTMLDetailsElement>('details.menu[open]')) {
        const target = event.target as Element;
        if (event.type === 'keydown') {
          if ((event as KeyboardEvent).key !== 'Escape' || document.querySelector('dialog[open]'))
            continue;
          menu.removeAttribute('open');
          menu.querySelector<HTMLElement>('summary')?.focus();
        } else if (
          (event.type === 'pointerdown' && !menu.contains(target)) ||
          (event.type === 'click' && target.closest('.menu-popover button'))
        )
          menu.removeAttribute('open');
      }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('click', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', close);
    };
  }, []);
  const [expanded, setExpanded] = useState(() => {
    try {
      return localStorage.getItem(`bouche-trou-menu-${user.id}`) === 'true';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false),
    [profile, setProfile] = useState(false),
    [focusMode, setFocusMode] = useState(false),
    [error, setError] = useState('');
  const go = useCallback(
    async (to: string) => {
      if (guard.current && !(await guard.current())) return;
      setMobileOpen(false);
      setFocusMode(false);
      navigate(to);
    },
    [navigate],
  );
  const registerGuard = useCallback((fn: Guard) => {
    guard.current = fn;
    return () => {
      if (guard.current === fn) guard.current = null;
    };
  }, []);
  async function signOut() {
    if (guard.current && !(await guard.current())) return;
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error(result.error.message);
      client.clear();
      navigate('/');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const currentView = new URLSearchParams(location.search).get('view');
  const items = [
    {
      title: 'Bibliothèque',
      icon: BookOpen,
      path: '/library',
      active:
        location.pathname.startsWith('/document/') ||
        (location.pathname === '/library' && !['recent', 'trash'].includes(currentView || '')),
    },
    {
      title: 'Réviser',
      icon: Sparkles,
      path: '/study',
      active: location.pathname.startsWith('/study'),
    },
    {
      title: 'Récents',
      icon: Clock3,
      path: '/library?view=recent',
      active: location.pathname === '/library' && currentView === 'recent',
    },
    {
      title: 'Corbeille',
      icon: Trash2,
      path: '/library?view=trash',
      active: location.pathname === '/library' && currentView === 'trash',
    },
  ];
  const controls = (withLabels: boolean) => (
    <>
      <div className="workspace-nav-upper">
        <button
          className="workspace-nav-button nav-toggle"
          aria-label={withLabels ? 'Replier le menu' : 'Déplier le menu'}
          aria-expanded={withLabels}
          onClick={() => {
            if (mobileOpen) setMobileOpen(false);
            else {
              setExpanded(!expanded);
              try {
                localStorage.setItem(`bouche-trou-menu-${user.id}`, String(!expanded));
              } catch {
                /* optional preference */
              }
            }
          }}
          title={withLabels ? 'Replier le menu' : 'Déplier le menu'}
        >
          <Menu size={19} />
          <span>{withLabels ? 'Masquer le menu' : 'Menu'}</span>
        </button>
        {items.map(({ title, icon: Icon, path, active }) => (
          <button
            key={title}
            className={`workspace-nav-button ${active ? 'active' : ''}`}
            aria-label={title}
            aria-current={active ? 'page' : undefined}
            title={title}
            onClick={() => void go(path)}
          >
            <Icon size={19} />
            <span>{title}</span>
          </button>
        ))}
      </div>
      <div className="workspace-nav-lower">
        <button
          className={`workspace-nav-button ${location.pathname === '/billing' ? 'active' : ''}`}
          aria-label="Mon abonnement"
          title="Mon abonnement"
          onClick={() => void go('/billing')}
        >
          <CreditCard size={18} />
          <span>Mon abonnement</span>
        </button>
        <button
          className="workspace-nav-button"
          aria-label="Réglages"
          title="Réglages"
          onClick={() => {
            setMobileOpen(false);
            setProfile(true);
          }}
        >
          <Settings size={18} />
          <span>Réglages</span>
        </button>
        <button
          className="workspace-nav-button"
          aria-label="Déconnexion"
          title="Déconnexion"
          onClick={() => void signOut()}
        >
          <LogOut size={18} />
          <span>Déconnexion</span>
        </button>
      </div>
    </>
  );
  return (
    <Context.Provider value={{ navigate: go, registerGuard, focusMode, setFocusMode }}>
      <div
        className={`workspace-frame ${expanded ? 'menu-expanded' : ''} ${focusMode ? 'focus-mode' : ''}`}
      >
        <aside
          className={`workspace-navigation ${expanded ? 'is-expanded' : ''}`}
          aria-label="Navigation principale"
        >
          {controls(expanded)}
        </aside>
        <div className="workspace-application">
          <header className="workspace-global-header">
            <button
              className="mobile-nav-trigger"
              aria-label="Ouvrir le menu"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={21} />
            </button>
            <button
              className="brand-link"
              aria-label="Bouche-trou · Revenir à la bibliothèque"
              onClick={() => void go('/library')}
            >
              <Brand />
            </button>
            <span className="workspace-header-spacer" />
            <span className="workspace-private">
              <LockKeyhole size={13} /> Espace privé
            </span>
            <button
              className="workspace-avatar"
              aria-label="Mon compte"
              title="Mon compte"
              onClick={() => setProfile(true)}
            >
              {user.name.slice(0, 1).toUpperCase()}
            </button>
          </header>
          {error && (
            <p className="alert error" role="alert">
              {error}
            </p>
          )}
          <div className="workspace-content">{children}</div>
        </div>
      </div>
      {mobileOpen && (
        <NavigationDrawer onClose={() => setMobileOpen(false)}>{controls(true)}</NavigationDrawer>
      )}
      {profile && <ProfileDialog user={user} onClose={() => setProfile(false)} />}
    </Context.Provider>
  );
}
function NavigationDrawer({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current!,
      previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    const media = window.matchMedia('(min-width: 761px)'),
      resize = () => {
        if (media.matches) onClose();
      };
    media.addEventListener('change', resize);
    return () => {
      media.removeEventListener('change', resize);
      dialog.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="navigation-drawer"
      aria-label="Navigation principale"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="navigation-drawer-inner">
        <button className="icon-button drawer-close" aria-label="Fermer le menu" onClick={onClose}>
          <X size={19} />
        </button>
        {children}
      </div>
    </dialog>
  );
}
function ProfileDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const client = useQueryClient();
  const { refetch: refreshSession } = authClient.useSession();
  const [name, setName] = useState(user.name),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  return (
    <Modal title="Mon compte" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await api('/profile', { method: 'PATCH', body: json({ name }) });
            await refreshSession({ query: { disableCookieCache: true } });
            await client.invalidateQueries({ queryKey: ['profile', user.id] });
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Nom affiché
          <input
            autoFocus
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Adresse email
          <input readOnly value={user.email} />
        </label>
        <p className="muted small">
          Vos documents et révisions sont privés. Les droits d’abonnement sont vérifiés côté
          serveur.
        </p>
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={async () => {
            setError('');
            setBusy(true);
            try {
              const result = await authClient.requestPasswordReset({
                email: user.email,
                redirectTo: `${window.location.origin}/reset-password`,
              });
              if (result.error) throw new Error(result.error.message);
              setNotice('Si le compte existe, un email de récupération a été envoyé.');
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Recevoir un lien pour changer mon mot de passe
        </button>
        {notice && <p role="status">{notice}</p>}
        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="button primary" disabled={busy}>
            Enregistrer
          </button>
        </div>
      </form>
    </Modal>
  );
}
