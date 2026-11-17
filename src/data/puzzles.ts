import type { PuzzleDef } from '../core/types';

/**
 * Small plans to fill exactly with the pieces given. Each has a known solution in
 * tests/puzzles.test.ts; the player may well find another.
 */
export const PUZZLES: readonly PuzzleDef[] = [
  {
    id: 'firstlane',
    name: { de: 'Die erste Gasse', en: 'The first lane' },
    blurb: {
      de: 'Jedes Haus braucht einen Weg und Wasser.',
      en: 'Every house needs a path and water.',
    },
    map: ['#######', '#.....#', '#.....#', '#.....#', '#######'],
    pieces: { house: 9, street: 5, well: 1 },
    needs: ['road', 'water'],
  },
  {
    id: 'marketsquare',
    name: { de: 'Am Marktplatz', en: 'On the market square' },
    blurb: {
      de: 'Der Marktstand muss an den Platz. Wohin mit dem Brunnen?',
      en: 'The stall has to stand by the square. Where does the well go?',
    },
    map: ['########', '#......#', '#......#', '#......#', '########'],
    pieces: { house: 10, street: 5, plaza: 1, stall: 1, well: 1 },
    needs: ['road', 'water', 'food'],
  },
  {
    id: 'narrowlanes',
    name: { de: 'Enge Gassen', en: 'Narrow lanes' },
    blurb: {
      de: 'Durch Gassen kommt das Wasser nur halb so weit. Zwei Brunnen müssen reichen.',
      en: 'Water only gets half as far through alleys. Two wells will have to do.',
    },
    map: ['###########', '#.........#', '#.........#', '#.........#', '###########'],
    pieces: { house: 16, alley: 9, well: 2 },
    needs: ['road', 'water'],
  },
  {
    id: 'chapellane',
    name: { de: 'Kapellengasse', en: 'Chapel lane' },
    blurb: {
      de: 'Zwei Straßen, ein Platz, eine Kapelle – und alles muss zusammenhängen.',
      en: 'Two streets, a square, a chapel – and it all has to hang together.',
    },
    map: [
      '#########',
      '#.......#',
      '#.......#',
      '#.......#',
      '#.......#',
      '#.......#',
      '#.......#',
      '#########',
    ],
    pieces: { house: 22, street: 15, plaza: 1, stall: 1, well: 1, chapel: 1 },
    needs: ['road', 'water', 'food', 'faith'],
  },
  {
    id: 'warren',
    name: { de: 'Gassengewirr', en: 'Warren of alleys' },
    blurb: {
      de: 'Lauter Gassen, eine Brandwache und vier Brunnen. Wo müssen sie stehen?',
      en: 'Nothing but alleys, one fire watch and four wells. Where must they go?',
    },
    map: [
      '###########',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '###########',
    ],
    pieces: { house: 22, alley: 18, well: 4, firewatch: 1 },
    needs: ['road', 'water', 'fire'],
  },
];
