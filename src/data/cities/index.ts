import type { CityDef } from '../../core/types';
import { carcassonne } from './carcassonne';
import { bhaktapur } from './bhaktapur';
import { bruges } from './bruges';
import { cusco } from './cusco';
import { dubrovnik } from './dubrovnik';
import { fes } from './fes';
import { montSaintMichel } from './montsaintmichel';
import { pingyao } from './pingyao';
import { sanGimignano } from './sangimignano';
import { nienburg } from './nienburg';

/** In the order they are offered: from the gentle start to the tricky ones. */
export const CITIES: readonly CityDef[] = [
  nienburg,
  carcassonne,
  dubrovnik,
  montSaintMichel,
  bruges,
  sanGimignano,
  fes,
  pingyao,
  bhaktapur,
  cusco,
];
