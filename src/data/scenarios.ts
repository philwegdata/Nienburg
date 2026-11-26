import type { ScenarioDef } from '../core/types';

/** Known cities with rules of their own. */
export const SCENARIOS: readonly ScenarioDef[] = [
  {
    id: 'canals',
    city: 'bruges',
    name: { de: 'Stadt ohne Brunnen', en: 'Town without wells' },
    blurb: {
      de: 'Der Boden ist zu feucht für Brunnen. Alles Wasser muss durch Kanäle kommen.',
      en: 'The ground is too wet for wells. All water has to come through canals.',
    },
    banned: ['well', 'cistern'],
    goals: [
      { kind: 'population', value: 150 },
      { kind: 'houses', level: 3, count: 15 },
      { kind: 'building', def: 'bathhouse', count: 2 },
    ],
  },
  {
    id: 'island',
    city: 'montsaintmichel',
    name: { de: 'Inselstadt', en: 'Island town' },
    blurb: {
      de: 'Ringsum nur Wasser und Watt: Land lässt sich nicht kaufen. Platz gibt es nur auf der Mauer und nach oben.',
      en: 'Nothing but water and mudflats all around: no land can be bought. Room is only on the wall and upwards.',
    },
    noLand: true,
    goals: [
      { kind: 'population', value: 90 },
      { kind: 'building', def: 'wallhouse', count: 6 },
      { kind: 'houses', level: 4, count: 6 },
    ],
  },
  {
    id: 'pilgrims',
    city: 'sangimignano',
    name: { de: 'Pilgerstadt', en: 'Pilgrim town' },
    blurb: {
      de: 'Auf dem Weg nach Süden kehren Pilger ein. Jede Kapelle und Kirche bringt Spenden.',
      en: 'Pilgrims on their way south stop here. Every chapel and church brings donations.',
    },
    modifiers: { shrineGold: 8 },
    goals: [
      { kind: 'building', def: 'chapel', count: 3 },
      { kind: 'population', value: 200 },
      { kind: 'building', def: 'church', count: 2 },
    ],
  },
];
