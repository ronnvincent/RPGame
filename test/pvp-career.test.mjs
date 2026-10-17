/**
 * REGRESSION TEST: the Colosseum career page tells the truth.
 *
 * A record is only worth showing if the page agrees with the code that writes
 * it. The title ladder, the reward table and the settlement all read from the
 * same constants and the same qualification rules here; the source checks make
 * sure the panel keeps using them instead of hard-coding a second set of
 * numbers that will drift the first time the purse is tuned.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { rolldown } from 'rolldown';

const careerSource = readFileSync(
  new URL('../src/sideview/ui/PvpCareerUI.ts', import.meta.url),
  'utf8',
);
const lobbySource = readFileSync(
  new URL('../src/sideview/ui/TournamentLobbyUI.ts', import.meta.url),
  'utf8',
);
const recordSource = readFileSync(
  new URL('../src/sideview/pvp/PvpRecord.ts', import.meta.url),
  'utf8',
);

const bundle = await rolldown({ input: 'test/pvp-career-fixture.ts', platform: 'browser' });
const generated = await bundle.generate({ format: 'esm' });
await bundle.close();
const code = generated.output.find(chunk => chunk.type === 'chunk')?.code;
assert.ok(code, 'career fixture should bundle');
const {
  PVP_REWARDS,
  defaultPvpRecord,
  pvpRating,
  pvpTitleFor,
  pvpTitleTiers,
  settlePvpMatch,
} = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

const recordWith = overrides => ({ ...defaultPvpRecord(), ...overrides });

function summary(overrides = {}) {
  return {
    winningTeam: 'red',
    redScore: 2,
    blueScore: 0,
    rounds: [],
    rows: [
      { id: 'me', name: 'Tester', team: 'red', isLocal: true, isBot: false, kills: 2, deaths: 0, damageDealt: 4000, damageTaken: 100, maxHp: 1550, currentHp: 1400, isAlive: true },
      { id: 'foe', name: 'Rival', team: 'blue', isLocal: false, isBot: false, kills: 0, deaths: 2, damageDealt: 100, damageTaken: 4000, maxHp: 1550, currentHp: 0, isAlive: false },
    ],
    mvp: null,
    localTeam: 'red',
    localWon: true,
    suddenDeathRounds: 0,
    format: '1v1',
    ...overrides,
  };
}

test('an empty career is a Challenger with every rung still ahead', () => {
  const tiers = pvpTitleTiers(defaultPvpRecord());
  assert.equal(tiers.length, 8);
  assert.equal(tiers[0].title, 'Challenger');
  assert.equal(tiers[0].earned, true);
  assert.equal(tiers.slice(1).every(tier => !tier.earned), true);
  assert.equal(tiers.slice(1).every(tier => tier.progress === 0), true);
  assert.equal(pvpTitleFor(defaultPvpRecord()), 'Challenger');
  assert.equal(pvpRating(defaultPvpRecord()), 1000);
});

test('progress tracks the requirement printed beside it', () => {
  const tiers = pvpTitleTiers(recordWith({ matches: 10, wins: 5, losses: 5, bestStreak: 4, mvps: 1 }));
  const byTitle = Object.fromEntries(tiers.map(tier => [tier.title, tier]));
  assert.equal(byTitle['Gladiator'].earned, true);
  assert.equal(byTitle['Arena Veteran'].earned, true);
  assert.equal(byTitle['Arena Veteran'].progress, 1);
  assert.equal(byTitle['Arena Darling'].earned, false);
  assert.ok(Math.abs(byTitle['Arena Darling'].progress - 1 / 3) < 1e-9);
  assert.ok(Math.abs(byTitle['The Unbroken'].progress - 0.4) < 1e-9);
  // 10 bouts at a 50% rate: the match count is halfway, the rate is short.
  assert.ok(Math.abs(byTitle['Colosseum Champion'].progress - 0.5) < 1e-9);
});

test('the current title is always the strongest earned rung', () => {
  const cases = [
    recordWith({ matches: 1, wins: 1, bestStreak: 1 }),
    recordWith({ matches: 6, wins: 5, bestStreak: 5, mvps: 3 }),
    recordWith({ matches: 20, wins: 12, losses: 8, bestStreak: 6, mvps: 10 }),
    recordWith({ matches: 30, wins: 20, losses: 10, bestStreak: 10, mvps: 2 }),
    recordWith({ matches: 55, wins: 50, losses: 5, bestStreak: 12, mvps: 1 }),
  ];
  for (const record of cases) {
    const earned = pvpTitleTiers(record).filter(tier => tier.earned);
    assert.ok(earned.length >= 1);
    assert.equal(
      earned[earned.length - 1].title,
      pvpTitleFor(record),
      `ladder and title disagree for ${JSON.stringify(record)}`,
    );
  }
});

test('the purse the page prints is the purse that is paid', () => {
  const win = settlePvpMatch(defaultPvpRecord(), summary(), new Date('2026-10-17T10:00:00'));
  const expectedWin =
    PVP_REWARDS.winByFormat['1v1']
    + 2 * PVP_REWARDS.perRound
    + PVP_REWARDS.streakStep
    + PVP_REWARDS.firstWinOfDay;
  assert.equal(win.rewards.total, expectedWin);
  assert.equal(win.rewards.mvp, 0, 'without the MVP crown the bonus is not paid');

  const mvpWin = settlePvpMatch(
    defaultPvpRecord(),
    summary({ mvp: summary().rows[0] }),
    new Date('2026-10-17T10:00:00'),
  );
  assert.equal(mvpWin.rewards.mvp, PVP_REWARDS.mvp);
  assert.equal(mvpWin.rewards.total, expectedWin + PVP_REWARDS.mvp);

  const loss = settlePvpMatch(
    recordWith({ matches: 1, wins: 0, losses: 1 }),
    summary({ winningTeam: 'blue', redScore: 1, blueScore: 2, localWon: false }),
    new Date('2026-10-17T10:00:00'),
  );
  assert.equal(loss.rewards.base, PVP_REWARDS.loss);
  assert.equal(loss.rewards.rounds, PVP_REWARDS.perRound);
  assert.equal(loss.rewards.mvp, 0);
  assert.equal(loss.rewards.streak, 0);
  assert.equal(loss.rewards.firstWin, 0);

  const draw = settlePvpMatch(
    recordWith({ matches: 2, wins: 1, losses: 1 }),
    summary({ winningTeam: null, redScore: 1, blueScore: 1, localWon: false }),
    new Date('2026-10-17T10:00:00'),
  );
  assert.equal(draw.rewards.base, PVP_REWARDS.loss);
  assert.equal(draw.rewards.rounds, 0, 'a drawn series pays no round bonus');
});

test('the page is built from the project assets and reads the same rules', () => {
  assert.match(careerSource, /panel_brown\.png/);
  assert.match(careerSource, /buttonLong_blue\.png/);
  assert.match(careerSource, /pvpTitleTiers\(record\)/);
  assert.match(careerSource, /pvpRating\(record\)/);
  assert.match(careerSource, /PVP_REWARDS\.winByFormat\['1v1'\]/);
  assert.match(careerSource, /PVP_REWARDS\.firstWinOfDay/);
  assert.match(careerSource, /escapeHtml\(playerName/);
  assert.match(careerSource, /installModalFocusTrap\(overlay/);
  assert.match(careerSource, /setAttribute\('aria-modal', 'true'\)/);
  assert.match(careerSource, /@media \(max-width: 640px\)/);
  assert.match(careerSource, /@media \(max-width: 380px\)/);
  assert.match(careerSource, /width: min\(720px, 100%\)/);

  // Every purse row must come from the constants, never a literal.
  const purseRows = careerSource.match(/class="pvp-career-purse-row"/g) || [];
  const constantRows = careerSource.match(/class="pvp-career-purse-row">[^]*?<b>\$\{gold\(PVP_REWARDS\./g) || [];
  assert.equal(purseRows.length, 9);
  assert.equal(constantRows.length, purseRows.length);

  // The reward constants are the only source in the settlement too.
  assert.match(recordSource, /PVP_REWARDS\.winByFormat/);
  assert.match(recordSource, /PVP_REWARDS\.streakCap/);
  assert.doesNotMatch(recordSource, /streak: localWon \? Math\.min\(record\.winStreak, 5\) \* 150/);
});

test('the lobby opens the career page from its record chip', () => {
  assert.match(lobbySource, /import \{ PvpCareerUI \} from '\.\/PvpCareerUI';/);
  assert.match(lobbySource, /data-action="open-career"/);
  assert.match(lobbySource, /class="pvp-career-chip" data-action="open-career"/);
  assert.match(lobbySource, /new PvpCareerUI\(document\.body, data\)/);
  assert.match(careerSource, /z-index: 10050/);
  assert.match(lobbySource, /record: loadPvpRecord\(\)/);
  assert.match(lobbySource, /\.pvp-career-chip:hover/);
});
