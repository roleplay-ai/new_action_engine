"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";

type PageLoadingContextValue = {
  /** True while a nav click is in-flight or the active page still needs data. */
  contentLoading: boolean;
  /** Href the user clicked, for instant nav highlighting. */
  pendingHref: string | null;
  beginNavigation: (href: string) => void;
  reportPageLoading: (route: string, loading: boolean) => void;
};

const PageLoadingContext = createContext<PageLoadingContextValue | null>(null);

function normalizePath(path: string) {
  if (!path) return "/";
  const trimmed = path.split("?")[0].split("#")[0];
  if (trimmed.length > 1 && trimmed.endsWith("/")) return trimmed.slice(0, -1);
  return trimmed || "/";
}

export function PageLoadingProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [navigationLoading, setNavigationLoading] = useState(false);
  const [pageLoading, setPageLoadingState] = useState(false);
  const pendingHrefRef = useRef<string | null>(null);
  const pathnameRef = useRef(pathname);

  pendingHrefRef.current = pendingHref;
  pathnameRef.current = pathname;

  const beginNavigation = useCallback(
    (href: string) => {
      const next = normalizePath(href);
      const current = normalizePath(pathnameRef.current || "/");
      if (next === current) {
        // A second click on the current tab cancels any stale/competing pending
        // highlight rather than leaving the loader tied to the previous click.
        pendingHrefRef.current = null;
        setPendingHref(null);
        setNavigationLoading(false);
        return;
      }
      pendingHrefRef.current = next;
      setPendingHref(next);
      setNavigationLoading(true);
      if (typeof window !== "undefined") {
        window.scrollTo(0, 0);
      }
    },
    []
  );

  const reportPageLoading = useCallback((route: string, loading: boolean) => {
    const routeNorm = normalizePath(route);
    const current = normalizePath(pathnameRef.current || "/");

    // Only the page currently mounted at the URL can control its data loader.
    // Background work and effects finishing on the previous route are ignored.
    if (routeNorm !== current) return;

    setPageLoadingState(loading);
  }, []);

  // Navigation and page-data loading have separate lifecycles. The URL change
  // completes navigation; the destination page independently reports whether
  // it still needs data.
  useLayoutEffect(() => {
    const current = normalizePath(pathname || "/");
    const pending = pendingHrefRef.current ? normalizePath(pendingHrefRef.current) : null;
    if (!pending || pending === current) {
      pendingHrefRef.current = null;
      setPendingHref(null);
      setNavigationLoading(false);
    }
  }, [pathname]);

  // Never leave the shell blocked forever if a navigation is cancelled by the
  // browser, middleware, or a rapid switch back to the current tab.
  useEffect(() => {
    if (!navigationLoading) return;
    const timeout = window.setTimeout(() => {
      pendingHrefRef.current = null;
      setPendingHref(null);
      setNavigationLoading(false);
    }, 15000);
    return () => window.clearTimeout(timeout);
  }, [navigationLoading, pendingHref]);

  const contentLoading = navigationLoading || pageLoading;

  const value = useMemo(
    () => ({ contentLoading, pendingHref, beginNavigation, reportPageLoading }),
    [contentLoading, pendingHref, beginNavigation, reportPageLoading]
  );

  return (
    <PageLoadingContext.Provider value={value}>{children}</PageLoadingContext.Provider>
  );
}

export function usePageLoadingControls() {
  const ctx = useContext(PageLoadingContext);
  if (!ctx) {
    return {
      contentLoading: false,
      pendingHref: null as string | null,
      beginNavigation: (_href: string) => {},
      reportPageLoading: (_route: string, _loading: boolean) => {},
    };
  }
  return ctx;
}

/**
 * Register whether the current page still needs data.
 * Only the active/destination route can drive the shared loader.
 */
export function usePageLoading(loading: boolean) {
  const pathname = usePathname();
  const { reportPageLoading } = usePageLoadingControls();

  useLayoutEffect(() => {
    reportPageLoading(pathname || "/", loading);
  }, [loading, pathname, reportPageLoading]);
}
