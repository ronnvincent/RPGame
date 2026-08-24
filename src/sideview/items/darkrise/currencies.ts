/**
 * The wallet beyond gold. Darkrise runs on several currencies and this game now
 * does too:
 *  - gold: common drops, services, socket carving
 *  - diamonds: premium-ish currency from melting legendaries and daily missions
 *  - keysOfPower: spent to open a dungeon on Fatal difficulty
 *  - unificationStones: endgame fusion fuel from daily/hourly missions
 *  - magicSubstance: produced by melting gear, consumed by enchanting
 */

export interface Wallet {
  gold: number;
  diamonds: number;
  keysOfPower: number;
  unificationStones: number;
  magicSubstance: number;
}

export const WALLET_DEFAULTS: Wallet = {
  gold: 50,
  diamonds: 0,
  keysOfPower: 3,
  unificationStones: 0,
  magicSubstance: 0,
};

/** Copy wallet-shaped fields onto any object that persists them. */
export function readWallet(source: Partial<Wallet> | undefined): Wallet {
  return { ...WALLET_DEFAULTS, ...(source || {}) };
}

export const CURRENCY_ICONS: Record<keyof Wallet, string> = {
  gold: '💰',
  diamonds: '💎',
  keysOfPower: '🔑',
  unificationStones: '⬥',
  magicSubstance: '✳️',
};

export const CURRENCY_LABELS: Record<keyof Wallet, string> = {
  gold: 'Gold',
  diamonds: 'Diamonds',
  keysOfPower: 'Keys of Power',
  unificationStones: 'Unification Stones',
  magicSubstance: 'Magic Substance',
};
