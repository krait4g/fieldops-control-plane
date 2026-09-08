"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

interface Registration {
  token: symbol;
  routeKey: string;
  revalidate: () => Promise<boolean>;
}

interface RequiredSnapshotContextValue {
  snapshotReady: boolean;
  register: (registration: Registration) => () => void;
  markReady: (token: symbol) => void;
  revalidateRequiredSnapshot: () => Promise<boolean>;
}

const RequiredSnapshotContext = createContext<RequiredSnapshotContextValue | null>(null);

/**
 * One provider is mounted for each tenant/site/path scope. Readiness is
 * latched after the first successful required REST snapshot and is reset only
 * by replacing this keyed provider on route or context changes.
 */
export function RequiredSnapshotProvider({ children }: { children: React.ReactNode }) {
  const registrationRef = useRef<Registration | null>(null);
  const readyRef = useRef(false);
  const [snapshotReady, setSnapshotReady] = useState(false);

  const register = useCallback((registration: Registration) => {
    registrationRef.current = registration;
    return () => {
      if (registrationRef.current?.token === registration.token) {
        registrationRef.current = null;
        readyRef.current = false;
      }
    };
  }, []);

  const markReady = useCallback((token: symbol) => {
    if (registrationRef.current?.token !== token || readyRef.current) return;
    readyRef.current = true;
    setSnapshotReady(true);
  }, []);

  const revalidateRequiredSnapshot = useCallback(async () => {
    const registration = registrationRef.current;
    if (!registration || !readyRef.current) return false;
    try {
      return await registration.revalidate();
    } catch {
      return false;
    }
  }, []);

  const value = useMemo<RequiredSnapshotContextValue>(
    () => ({ snapshotReady, register, markReady, revalidateRequiredSnapshot }),
    [snapshotReady, register, markReady, revalidateRequiredSnapshot],
  );

  return (
    <RequiredSnapshotContext.Provider value={value}>
      {children}
    </RequiredSnapshotContext.Provider>
  );
}

export function useRequiredSnapshotCoordinator() {
  const value = useContext(RequiredSnapshotContext);
  if (!value) {
    throw new Error("useRequiredSnapshotCoordinator must be used within RequiredSnapshotProvider");
  }
  return {
    snapshotReady: value.snapshotReady,
    revalidateRequiredSnapshot: value.revalidateRequiredSnapshot,
  };
}

export function useRequiredSnapshot({
  routeKey,
  ready,
  revalidate,
}: {
  routeKey: string;
  ready: boolean;
  revalidate: () => Promise<boolean>;
}) {
  const coordinator = useContext(RequiredSnapshotContext);
  if (!coordinator) {
    throw new Error("useRequiredSnapshot must be used within RequiredSnapshotProvider");
  }

  const tokenRef = useRef(Symbol(routeKey));
  const revalidateRef = useRef(revalidate);
  const { register, markReady } = coordinator;

  useLayoutEffect(() => {
    revalidateRef.current = revalidate;
  });

  useLayoutEffect(
    () =>
      register({
        token: tokenRef.current,
        routeKey,
        revalidate: () => revalidateRef.current(),
      }),
    [register, routeKey],
  );

  useLayoutEffect(() => {
    if (ready) markReady(tokenRef.current);
  }, [markReady, ready]);
}
