import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';

import { mockCountries } from '@/data/countries';

// The one place the visited list lives. The globe and the visited count both
// read it from here, so they can't disagree. Saved on the phone with
// AsyncStorage so it survives app reloads.

type VisitedCountries = {
  /** ISO numeric country ids (see src/types). */
  visitedIds: ReadonlySet<string>;
  toggleVisited: (countryId: string) => void;
};

const STORAGE_KEY = 'roamly.visitedCountryIds.v1';

const initialIds: ReadonlySet<string> = new Set(
  mockCountries.filter((c) => c.visited).map((c) => c.id),
);

const VisitedCountriesContext = createContext<VisitedCountries | null>(null);

export function VisitedCountriesProvider({ children }: { children: ReactNode }) {
  const [visitedIds, setVisitedIds] = useState(initialIds);
  // Don't save until the stored list has been read, or the mock list would overwrite it.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved !== null) setVisitedIds(new Set(JSON.parse(saved) as string[]));
      })
      .catch((error) => console.warn('Could not load visited countries', error))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...visitedIds])).catch((error) =>
      console.warn('Could not save visited countries', error),
    );
  }, [visitedIds, loaded]);

  const toggleVisited = (countryId: string) => {
    setVisitedIds((current) => {
      const next = new Set(current);
      if (next.has(countryId)) next.delete(countryId);
      else next.add(countryId);
      return next;
    });
  };

  return (
    <VisitedCountriesContext value={{ visitedIds, toggleVisited }}>
      {children}
    </VisitedCountriesContext>
  );
}

export function useVisitedCountries(): VisitedCountries {
  const value = use(VisitedCountriesContext);
  if (!value) throw new Error('useVisitedCountries must be used inside VisitedCountriesProvider');
  return value;
}
