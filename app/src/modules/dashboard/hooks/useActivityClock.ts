import { useEffect, useState } from "react";

const ACTIVITY_CLOCK_INTERVAL_MS = 30_000;

export function useActivityClock(): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, ACTIVITY_CLOCK_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, []);

  return now;
}
