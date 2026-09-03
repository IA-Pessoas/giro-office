import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useAuth } from "./AuthContext";
import {
  buildFeatureFlagContext,
  createBrowserFeatureFlags,
  createDisabledBrowserFeatureFlags,
  getBrowserFeatureFlagConfig,
  type BrowserFeatureFlagContext,
  type BrowserFeatureFlagService,
} from "../shared/featureFlags/client";

interface FeatureFlagsContextValue {
  status: BrowserFeatureFlagService["status"];
  isEnabled(flagKey: string, defaultValue: boolean): Promise<boolean>;
}

const disabledFeatureFlags = createDisabledBrowserFeatureFlags();
const FeatureFlagsContext = createContext<FeatureFlagsContextValue>({
  status: "disabled",
  isEnabled: disabledFeatureFlags.isEnabled,
});

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const context = useMemo<BrowserFeatureFlagContext>(
    () => buildFeatureFlagContext(user),
    [user?.id, user?.organization_id],
  );
  const contextRef = useRef(context);
  const serviceRef = useRef<BrowserFeatureFlagService>(disabledFeatureFlags);
  const [service, setService] = useState<BrowserFeatureFlagService>(disabledFeatureFlags);

  contextRef.current = context;

  useEffect(() => {
    let mounted = true;

    void createBrowserFeatureFlags(getBrowserFeatureFlagConfig(), contextRef.current).then(
      (nextService) => {
        if (!mounted) {
          void nextService.close();
          return;
        }

        serviceRef.current = nextService;
        setService(nextService);
      },
    );

    return () => {
      mounted = false;
      void serviceRef.current.close();
    };
  }, []);

  useEffect(() => {
    if (serviceRef.current.status === "ready") {
      void serviceRef.current.identify(context);
    }
  }, [context, service]);

  const value = useMemo<FeatureFlagsContextValue>(
    () => ({ status: service.status, isEnabled: service.isEnabled }),
    [service],
  );

  return <FeatureFlagsContext.Provider value={value}>{children}</FeatureFlagsContext.Provider>;
}

export function useFeatureFlags(): FeatureFlagsContextValue {
  return useContext(FeatureFlagsContext);
}
