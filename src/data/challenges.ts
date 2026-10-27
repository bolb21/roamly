import type { DailyChallenge, DemoUser } from '@/types';

/** Fictional demo user. */
export const demoUser: DemoUser = {
  firstName: 'Henry',
};

/** Today's mock challenge, tied to a mock area. */
export const todaysChallenge: DailyChallenge = {
  id: 'challenge-bkk-01',
  title: 'Find the floating market',
  description:
    'Head to a canal-side floating market and try a dish you have never had before. Bonus: ask a vendor what their favourite thing to cook is.',
  areaLabel: 'Bangkok, Thailand',
  image: null,
  activityId: null,
};

/** Shown when no (mock) area is available, so we never claim to know where the user is. */
export const genericChallenge: DailyChallenge = {
  id: 'challenge-generic-01',
  title: 'Try something local',
  description:
    'Wherever you are today, find a food, drink, or snack you have never tried and that is popular nearby.',
  areaLabel: null,
  image: null,
  activityId: null,
};
