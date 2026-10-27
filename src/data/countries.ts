import type { Country } from '@/types';

// Mock starting state for the demo. Bangkok/Thailand is a mock "current
// location" only; the app never reads the device's real location.
export const mockCountries: Country[] = [
  { id: 'TH', name: 'Thailand', visited: true, isCurrentLocation: true },
  { id: 'GB', name: 'United Kingdom', visited: true, isCurrentLocation: false },
  { id: 'FR', name: 'France', visited: true, isCurrentLocation: false },
  { id: 'IT', name: 'Italy', visited: true, isCurrentLocation: false },
  { id: 'ES', name: 'Spain', visited: true, isCurrentLocation: false },
  { id: 'US', name: 'United States', visited: true, isCurrentLocation: false },
  { id: 'BR', name: 'Brazil', visited: false, isCurrentLocation: false },
  { id: 'JP', name: 'Japan', visited: false, isCurrentLocation: false },
  { id: 'AU', name: 'Australia', visited: false, isCurrentLocation: false },
  { id: 'ZA', name: 'South Africa', visited: false, isCurrentLocation: false },
  { id: 'IN', name: 'India', visited: false, isCurrentLocation: false },
  { id: 'MX', name: 'Mexico', visited: false, isCurrentLocation: false },
];
