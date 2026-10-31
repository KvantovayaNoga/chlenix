// ============================================================
// Собственный мини-роутер приложения Chlenix.
// Заменяет react-router-dom: в production-сборке бандл роутера
// мог содержать устаревшую копию React-контекста (несколько копий
// пакета "react" в дереве node_modules) — все хуки роутера падали с
// «Uncaught Error», и страница оставалась пустой (только фон).
// Роутер реализован только на React Context + History API,
// внешних зависимостей не имеет.
// Поддерживает ровно те возможности, которые использует приложение:
//   Router, Routes/Route (вложенные, :параметры, "*" — wildcard),
//   Navigate, Outlet, Link, NavLink, useNavigate, useParams, useLocation.
// ============================================================
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import type { AnchorHTMLAttributes, ReactElement, ReactNode } from 'react';

// ---------- низкоуровневый контекст ----------

interface RouterCtx {
  path: string;
  search: string;
  navigate: (to: string, opts?: { replace?: boolean }) => void;
  setSearch: (init?: string | URLSearchParams, opts?: { replace?: boolean }) => void;
}

const RouterContext = createContext<RouterCtx | null>(null);

function useRouter(): RouterCtx {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter must be used within <Router>');
  return ctx;
}

export function useNavigate() {
  const { navigate } = useRouter();
  return navigate;
}

export function useLocation() {
  const { path, search } = useRouter();
  return { pathname: path, search, hash: '' };
}

// Аналог useSearchParams из react-router-dom v6
export function useSearchParams(): [URLSearchParams, (init?: string | URLSearchParams, opts?: { replace?: boolean }) => void] {
  const { search, setSearch } = useRouter();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  return [params, setSearch];
}

// ---------- сопоставление путей ----------

function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const pp = pattern.split('/').filter(Boolean);
  const xp = pathname.split('/').filter(Boolean);
  const params: Record<string, string> = {};
  for (let i = 0; i < pp.length; i++) {
    const seg = pp[i];
    if (seg === '*') return params; // wildcard — остальное игнорируется
    if (i >= xp.length) return null;
    if (seg.startsWith(':')) {
      params[seg.slice(1)] = decodeURIComponent(xp[i]);
    } else if (seg !== xp[i]) {
      return null;
    }
  }
  return pp.length === xp.length ? params : null;
}

// ---------- контекст текущего совпавшего маршрута (:params) ----------

const ParamsContext = createContext<Record<string, string>>({});

export function useParams(): Record<string, string> {
  return useContext(ParamsContext);
}

// ---------- контекст родительского элемента (для Outlet) ----------

const OutletContext = createContext<ReactNode>(null);

export function Outlet() {
  return <>{useContext(OutletContext)}</>;
}

// ---------- компоненты ----------

interface RouteProps {
  path?: string;
  element?: ReactNode;
  children?: ReactNode;
}

// Компонент-заглушка: структура маршрутов читается из props детей <Routes>.
export function Route(_props: RouteProps): null {
  return null;
}

interface RoutesProps {
  children?: ReactNode;
}

export function Routes({ children }: RoutesProps) {
  const { path } = useRouter();

  const rendered = useMemo(() => {
    const kids = flatten(children);

    const run = (list: ReactElement[], baseRender: (node: ReactNode) => ReactNode): ReactNode => {
      for (const child of list) {
        if (child.type !== Route) continue;
        const p: RouteProps = child.props as RouteProps;
        const pattern = p.path ?? '';
        let params: Record<string, string> | null = null;
        if (pattern === '') {
          params = {}; // layout-маршрут без path: всегда подходит
        } else if (pattern === '*') {
          params = {}; // wildcard: подходит к любому пути
        } else {
          params = matchPath(pattern, path);
        }
        if (!params) continue;

        const inner = run(flatten(p.children), (node) => node);
        const content = (
          <ParamsContext.Provider value={params}>
            {p.element != null ? (
              <OutletContext.Provider value={inner}>{p.element}</OutletContext.Provider>
            ) : inner}
          </ParamsContext.Provider>
        );
        return baseRender(content);
      }
      return null;
    };

    return run(kids, (node) => node);
  }, [children, path]);

  return <>{rendered}</>;
}

function flatten(children: ReactNode): ReactElement[] {
  const out: ReactElement[] = [];
  const walk = (c: ReactNode) => {
    if (c == null || typeof c === 'boolean' || typeof c === 'string') return;
    if (Array.isArray(c)) { c.forEach(walk); return; }
    if (isReactElement(c)) out.push(c);
  };
  walk(children);
  return out;
}

function isReactElement(node: unknown): node is ReactElement {
  return typeof node === 'object' && node !== null && '$$typeof' in (node as object);
}

interface NavigateProps {
  to: string;
  replace?: boolean;
}

export function Navigate({ to, replace = true }: NavigateProps) {
  const { navigate } = useRouter();
  useEffect(() => {
    navigate(to, { replace });
  }, [to, replace, navigate]);
  return null;
}

// ---------- корневой провайдер (аналог BrowserRouter) ----------

function currentPath(): string {
  return window.location.pathname || '/';
}
function currentSearch(): string {
  return window.location.search || '';
}

export function Router({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(currentPath);
  const [search, setSearchState] = useState(currentSearch);

  useEffect(() => {
    const onPop = () => {
      setPath(currentPath());
      setSearchState(currentSearch());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to: string, opts?: { replace?: boolean }) => {
    const url = to || '/';
    if (opts?.replace) window.history.replaceState(null, '', url);
    else window.history.pushState(null, '', url);
    //pathname/search парсим из нового URL
    const u = new URL(url, window.location.origin);
    setPath(u.pathname);
    setSearchState(u.search);
  }, []);

  const setSearch = useCallback((init?: string | URLSearchParams, opts?: { replace?: boolean }) => {
    const qs = init == null ? '' : (typeof init === 'string' ? init : init.toString());
    const normalized = qs && !qs.startsWith('?') ? `?${qs}` : qs;
    const url = window.location.pathname + normalized + window.location.hash;
    if (opts?.replace) window.history.replaceState(null, '', url);
    else window.history.pushState(null, '', url);
    setSearchState(normalized);
  }, []);

  const value = useMemo(() => ({ path, search, navigate, setSearch }), [path, search, navigate, setSearch]);

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

// ---------- ссылки ----------

type To = string | { pathname: string; search?: string };

function hrefOf(to: To): string {
  return typeof to === 'string' ? to : `${to.pathname}${to.search ?? ''}`;
}

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: To;
}

export function Link({ to, onClick, ...rest }: LinkProps) {
  const { navigate } = useRouter();
  const href = hrefOf(to);
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(href);
  };
  return <a href={href} onClick={handleClick} {...rest} />;
}

interface NavLinkProps extends LinkProps {
  className?: string | ((state: { isActive: boolean }) => string);
  activeClassName?: string;
  end?: boolean;
}

export function NavLink({ className, activeClassName, to, end = false, ...rest }: NavLinkProps) {
  const { path } = useRouter();
  const target = typeof to === 'string' ? to : to.pathname;
  const isActive = path === target || (!end && target !== '/' && path.startsWith(target + '/'));
  const cls = typeof className === 'function'
    ? className({ isActive })
    : [className, isActive ? (activeClassName || 'active') : null].filter(Boolean).join(' ') || undefined;
  return <Link to={to} className={cls} aria-current={isActive ? 'page' : undefined} {...rest} />;
}
