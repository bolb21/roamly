// Domain types for Roamly. Shapes follow PRD section 8 so they can later be
// backed by a real data source without changing the screens.

export type Country = {
  /** ISO 3166-1 numeric code, e.g. '764' for Thailand (same ids as the globe's map data). */
  id: string;
  name: string;
  visited: boolean;
  /** Mock state only — never derived from the device's real location. */
  isCurrentLocation: boolean;
};

export type Activity = {
  id: string;
  name: string;
  description: string;
  countryId: string;
  areaLabel: string;
  latitude: number | null;
  longitude: number | null;
  image: string | null;
};

export type Traveller = {
  id: string;
  displayName: string;
  profileImage: string | null;
  areaLabel: string;
  latitude: number | null;
  longitude: number | null;
};

export type DailyChallenge = {
  id: string;
  title: string;
  description: string;
  /** Null means no (mock) location is known; show location-neutral copy. */
  areaLabel: string | null;
  image: string | null;
  activityId: string | null;
};

/** The fictional demo user the prototype greets. Not a real account. */
export type DemoUser = {
  firstName: string;
};
