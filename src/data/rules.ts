import type { Rules } from '../core/types';
import { BALANCE } from './balance';
import { BUILDINGS } from './buildings';
import { HOUSING } from './housing';

export const RULES: Rules = { buildings: BUILDINGS, housing: HOUSING, balance: BALANCE };
