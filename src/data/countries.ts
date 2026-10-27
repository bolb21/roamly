import type { Country } from '@/types';

// Mock starting state for the demo, used until the user has saved their own
// visited list. Ids are ISO 3166-1 numeric codes, matching the globe's map data.
// Bangkok/Thailand is a mock "current location" only; the app never reads the
// device's real location.
export const mockCountries: Country[] = [
  { id: '764', name: 'Thailand', visited: true, isCurrentLocation: true },
  { id: '826', name: 'United Kingdom', visited: true, isCurrentLocation: false },
  { id: '250', name: 'France', visited: true, isCurrentLocation: false },
  { id: '380', name: 'Italy', visited: true, isCurrentLocation: false },
  { id: '724', name: 'Spain', visited: true, isCurrentLocation: false },
  { id: '840', name: 'United States', visited: true, isCurrentLocation: false },
  { id: '076', name: 'Brazil', visited: false, isCurrentLocation: false },
  { id: '392', name: 'Japan', visited: false, isCurrentLocation: false },
  { id: '036', name: 'Australia', visited: false, isCurrentLocation: false },
  { id: '710', name: 'South Africa', visited: false, isCurrentLocation: false },
  { id: '356', name: 'India', visited: false, isCurrentLocation: false },
  { id: '484', name: 'Mexico', visited: false, isCurrentLocation: false },
];
