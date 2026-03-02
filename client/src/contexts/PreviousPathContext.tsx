import { createContext, useContext, useRef, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";

const PreviousPathContext = createContext<string | null>(null);

export function PreviousPathProvider({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const previousRef = useRef<string>(location);
  const [previousPath, setPreviousPath] = useState<string | null>(null);

  useEffect(() => {
    setPreviousPath(previousRef.current);
    previousRef.current = location;
  }, [location]);

  return (
    <PreviousPathContext.Provider value={previousPath}>
      {children}
    </PreviousPathContext.Provider>
  );
}

export function usePreviousPath(): string | null {
  return useContext(PreviousPathContext);
}
