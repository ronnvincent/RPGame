/**
 * REGRESSION TEST: the match ends on a results card, not on a silent timer.
 *
 * A Colosseum bout used to end with a four-second banner and a 3.6 s timer
 * that dropped the player in town. Nothing recorded who won, nobody saw the
 * scoreboard, and the only reward was gold announced by floating text that
 * could be skipped by a dropped frame. These checks pin the replacement:
 *
 *   - one summary object drives the card, the MVP and the purse;
 *   - the purse is banked when the card is built, not by a timer;
 *   - a rematch is a unanimous vote that relaunches the same room with a
 *     fresh scoreboard, through the ordinary dungeon_start path;
 *   - the card is chrome built from the project's Kenney UI pack.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  TournamentMatch,
  buildPvpMatchSummary,
} from '../src/sideview/pvp/TournamentSystem.ts';
import {
  defaultPvpRecord,
  settlePvpMatch,
  pvpTitleFor,
  describePvpRecord,
  loadPvpRecord,
  savePvpRecord,
  pvpWinRate,
  pvpRating,
  coercePvpRecord,
  mergePvpRecords,
} from '../src/sideview/pvp/PvpRecord.ts';

const gameSource = readFileSync(
  new URL('../src/sideview/SideViewGame.ts', import.meta.url),
  'utf8',
);
const engineSource = readFileSync(
  new URL('../src/sideview/engine/SideViewEngine.ts', import.meta.url),
  'utf8',
);
const resultsSource = readFileSync(
  new URL('../src/sideview/ui/PvpResultsUI.ts', import.meta.url),
  'utf8',
);
const networkSource = readFileSync(
  new URL('../src/sideview/network/NetworkManager.ts', import.meta.url),
  'utf8',
);
const serverSource = readFileSync(
  new URL('../server/index.js', import.meta.url),
  'utf8',
);

/** A finished 2v2 with hand-set stats, so the MVP ordering is unambiguous. */
function finishedMatch({ localTeam = 'red', redScore = 2, blueScore = 1 } = {}) {
  const match = new TournamentMatch({ format: '2v2' });
  match.setupTeams('Local Hero', 'warrior', '2v2');
  match.redScore = redScore;
  match.blueScore = blueScore;
  match.matchWinner = redScore === blueScore ? null : redScore > blueScore ? 'red' : 'blue';
  match.status = 'match_end';

  const red = match.fighters.filter(f => f.team === 'red');
  const blue = match.fighters.filter(f => f.team === 'blue');
  red[0].isLocal = true;
  red[0].name = 'Local Hero';
  red[0].kills = 4;
  red[0].deaths = 1;
  red[0].damageDealt = 2600;
  red[0].damageTaken = 1400;
  red[1].kills = 1;
  red[1].deaths = 2;
  red[1].damageDealt = 900;
  blue[0].kills = 3;
  blue[0].deaths = 2;
  blue[0].damageDealt = 2100;
  blue[1].kills = 0;
  blue[1].deaths = 3;
  blue[1].damageDealt = 400;

  match.roundHistory.push(
    { roundNumber: 1, winner: 'red', reason: 'wipe', redScore: 1, blueScore: 0 },
    { roundNumber: 2, winner: 'blue', reason: 'sudden_death', redScore: 1, blueScore: 1 },
    { roundNumber: 3, winner: 'red', reason: 'health_lead', redScore: 2, blueScore: 1 },
  );
  return { match, localTeam, red, blue };
}

test('the summary names the winner, the local side and one MVP', () => {
  const { match, localTeam } = finishedMatch();
  const summary = buildPvpMatchSummary(match, localTeam);

  assert.equal(summary.winningTeam, 'red');
  assert.equal(summary.localWon, true);
  assert.equal(summary.redScore, 2);
  assert.equal(summary.blueScore, 1);
  assert.equal(summary.rows.length, 4, 'every fighter appears on the card');
  assert.equal(summary.suddenDeathRounds, 1, 'overtime rounds are called out');
  assert.equal(summary.mvp?.name, 'Local Hero', 'MVP is the top killer');

  // Kills first, then damage: a 3-kill/2100-damage blue player beats a
  // 1-kill teammate even though both beat the 0-kill support.
  const order = [...summary.rows].sort((a, b) => (b.kills - a.kills) || (b.damageDealt - a.damageDealt));
  assert.deepEqual(order.map(r => r.kills), [4, 3, 1, 0]);
});

test('MVP falls back to damage when kills are tied, then to fewer deaths', () => {
  const { match } = finishedMatch();
  const red = match.fighters.filter(f => f.team === 'red');
  for (const fighter of match.fighters) {
    fighter.kills = 0;
    fighter.deaths = 0;
    fighter.damageDealt = 0;
  }
  red[0].kills = 2;
  red[0].deaths = 3;
  red[0].damageDealt = 1000;
  red[1].kills = 2;
  red[1].deaths = 1;
  red[1].damageDealt = 1000;

  const summary = buildPvpMatchSummary(match, 'red');
  assert.equal(summary.mvp?.id, red[1].id, 'identical kills and damage are broken by fewer deaths');
});

test('a win pays the purse once, and the record remembers it', () => {
  const { match, localTeam } = finishedMatch();
  const summary = buildPvpMatchSummary(match, localTeam);
  const previous = defaultPvpRecord();
  const settled = settlePvpMatch(previous, summary, new Date('2025-06-02T12:00:00'));

  assert.equal(settled.record.matches, 1);
  assert.equal(settled.record.wins, 1);
  assert.equal(settled.record.losses, 0);
  assert.equal(settled.record.winStreak, 1);
  assert.equal(settled.record.roundsWon, 2);
  assert.equal(settled.record.roundsLost, 1);
  assert.equal(settled.record.mvps, 1, 'the local MVP counts');
  assert.equal(settled.record.suddenDeathWins, 1, 'a win with an overtime round counts');
  assert.equal(settled.record.lastWinDay, '2025-06-02');

  // 2v2 win: 2000 base + 2 rounds x 300 + 400 MVP + 150 streak + 500 first win.
  assert.deepEqual(settled.rewards, {
    base: 2000,
    rounds: 600,
    mvp: 400,
    streak: 150,
    firstWin: 500,
    total: 3650,
  });
  assert.equal(settled.record.goldEarned, 3650);
  assert.equal(settled.title, 'Gladiator');
  assert.equal(settled.newTitle, 'Gladiator', 'the first win promotes out of Challenger');
});

test('a second win on the same day does not pay the daily bonus twice', () => {
  const { match } = finishedMatch();
  const summary = buildPvpMatchSummary(match, 'red');
  const first = settlePvpMatch(defaultPvpRecord(), summary, new Date('2025-06-02T09:00:00'));
  const second = settlePvpMatch(first.record, summary, new Date('2025-06-02T21:00:00'));

  assert.equal(first.rewards.firstWin, 500);
  assert.equal(second.rewards.firstWin, 0, 'the daily purse is a daily purse');
  assert.equal(second.record.wins, 2);
  assert.equal(second.record.winStreak, 2);
  // The second settlement sees a record that already qualified for Gladiator;
  // a promotion is announced once.
  assert.equal(second.newTitle, null);
  assert.equal(second.rewards.streak, 300);
});

test('a loss breaks the streak, pays a consolation purse, and still counts', () => {
  const { match } = finishedMatch();
  const summary = buildPvpMatchSummary(match, 'blue');
  const previous = { ...defaultPvpRecord(), wins: 4, winStreak: 3, bestStreak: 3, lastWinDay: '2025-06-01' };
  const settled = settlePvpMatch(previous, summary, new Date('2025-06-02T12:00:00'));

  assert.equal(settled.record.losses, 1);
  assert.equal(settled.record.winStreak, 0);
  assert.equal(settled.record.bestStreak, 3, 'the best streak survives a loss');
  assert.equal(summary.localWon, false);
  assert.equal(settled.rewards.base, 250);
  assert.equal(settled.rewards.mvp, 0, 'a loser is never paid the MVP bonus');
  assert.equal(settled.rewards.rounds, 300, 'the losing side is still paid for the round it took');
});

test('a draw is a match, not a loss', () => {
  const { match } = finishedMatch({ redScore: 1, blueScore: 1 });
  const summary = buildPvpMatchSummary(match, 'red');
  assert.equal(summary.winningTeam, null);

  const settled = settlePvpMatch({ ...defaultPvpRecord(), winStreak: 2 }, summary);
  assert.equal(settled.record.matches, 1);
  assert.equal(settled.record.wins, 0);
  assert.equal(settled.record.losses, 0);
  assert.equal(settled.record.winStreak, 2, 'a draw neither builds nor breaks a streak');
});

test('titles climb with wins and streaks, and never regress by accident', () => {
  assert.equal(pvpTitleFor(defaultPvpRecord()), 'Challenger');
  assert.equal(pvpTitleFor({ ...defaultPvpRecord(), wins: 1 }), 'Gladiator');
  assert.equal(pvpTitleFor({ ...defaultPvpRecord(), wins: 5 }), 'Arena Veteran');
  assert.equal(pvpTitleFor({ ...defaultPvpRecord(), mvps: 3, wins: 2 }), 'Arena Darling');
  assert.equal(
    pvpTitleFor({ ...defaultPvpRecord(), matches: 20, wins: 13 }),
    'Colosseum Champion',
  );
  assert.equal(pvpTitleFor({ ...defaultPvpRecord(), bestStreak: 10 }), 'The Unbroken');
  assert.equal(pvpTitleFor({ ...defaultPvpRecord(), wins: 50 }), 'Arena Legend');

  assert.equal(pvpWinRate(defaultPvpRecord()), 0, 'no matches is 0%, not NaN');
  assert.match(describePvpRecord({ ...defaultPvpRecord(), wins: 3, losses: 1, matches: 4, winStreak: 2 }), /3W - 1L · 75%/);
});

test('the record survives a save/load round trip and rejects junk', () => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: key => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
    clear: () => storage.clear(),
  };

  const record = { ...defaultPvpRecord(), matches: 7, wins: 4, losses: 3, goldEarned: 9800, lastWinDay: '2025-06-02' };
  savePvpRecord(record);
  assert.deepEqual(loadPvpRecord(), record);

  storage.set('rpg-pvp-record-v1', '{not json');
  assert.deepEqual(loadPvpRecord(), defaultPvpRecord(), 'a corrupt blob degrades to a fresh record');

  storage.set('rpg-pvp-record-v1', JSON.stringify({ wins: -5, matches: 'x', lastWinDay: 42 }));
  const repaired = loadPvpRecord();
  assert.equal(repaired.wins, 0);
  assert.equal(repaired.matches, 0);
  assert.equal(repaired.lastWinDay, '');
  delete globalThis.localStorage;
});

test('the engine hands a finished match to the results screen instead of exiting on a timer', () => {
  assert.match(engineSource, /public onPvpMatchEnded\?: \(summary: PvpMatchSummary\) => void;/);
  assert.doesNotMatch(engineSource, /}, 3600\);/,
    'the old 3.6 s auto-exit is what dropped players into town before they read the score');
  assert.match(engineSource, /buildPvpMatchSummary\(match, this\.pvpTeam\)/,
    'the card is fed by the same summary the record is written from');
  assert.match(gameSource, /this\.engine\.onPvpMatchEnded = \(summary\) => this\.presentPvpResults\(summary\);/);
  assert.match(gameSource, /settlePvpMatch\(loadPvpRecord\(\), summary\)/);
  assert.match(gameSource, /savePvpRecord\(settlement\.record\)/,
    'the record has to be persisted, not just displayed');
});

test('a rematch is a unanimous vote that relaunches the room with a clean board', () => {
  const handler = serverSource.slice(
    serverSource.indexOf("socket.on('pvp_rematch_vote'"),
    serverSource.indexOf("socket.on('leave_lobby'"),
  );
  assert.ok(handler.length > 0, 'the server must accept rematch votes');
  assert.match(handler, /const voters = pvpFighters\(room\);/,
    'the electorate is the fighters, not the bench');
  assert.match(handler, /voters\.length >= 2 && voters\.every\(id => room\.rematchVotes\.has\(id\)\)/,
    'one hold-out must be enough to block the relaunch');
  assert.match(handler, /startPvpRematch\(p\.room\)/);

  const starter = serverSource.slice(
    serverSource.indexOf('function startPvpRematch'),
    serverSource.indexOf('function removeMemberFromRoom'),
  );
  assert.match(starter, /resetPvpMatchState\(room\)/);
  assert.match(starter, /room\.members\.length < 2/);
  assert.match(starter, /red < 1 \|\| blue < 1/, 'a one-team room is not a match');

  const reset = serverSource.slice(
    serverSource.indexOf('function resetPvpMatchState'),
    serverSource.indexOf('function emitRoomDungeonStart'),
  );
  assert.match(reset, /room\.pvpScore = \{ red: 0, blue: 0 \}/);
  assert.match(reset, /room\.pvpRound = 1/);
  assert.match(reset, /room\.rematchVotes = new Set\(\)/);

  // The relaunch must use the same packet a first launch does, so the client
  // needs no second code path (and no second way to get its state wrong).
  assert.match(serverSource, /io\.to\(sid\)\.emit\('dungeon_start'/);
  assert.match(networkSource, /public sendPvpRematchVote\(\)[\s\S]{0,160}pvp_rematch_vote/);
  assert.match(networkSource, /this\.socket\.on\('pvp_rematch_state'/);
});

test('the kill feed takes its teams from the room, not from two hard-coded strings', () => {
  const block = networkSource.slice(
    networkSource.indexOf("data.itemName.startsWith('PVPDOWNED:')"),
    networkSource.indexOf("this.onPartySupportCb?.(data);"),
  );
  assert.doesNotMatch(block, /downedTeam: 'red'/, 'guessing red painted every kill the same way');
  assert.doesNotMatch(block, /killerTeam: 'blue'/);
  assert.match(block, /const teams = this\.currentLobbyState\?\.pvpTeams \|\| \{\};/);
});

test('the results card is chrome from the project UI pack, responsive, and never auto-closes', () => {
  for (const asset of ['panel_brown.png', 'buttonLong_brown.png', 'buttonLong_blue.png']) {
    assert.ok(resultsSource.includes(asset), `${asset} supplies the card chrome`);
  }
  assert.match(resultsSource, /@media \(max-width: 640px\)/,
    'the card must stack for a phone, not shrink a desktop grid');
  assert.match(resultsSource, /grid-template-columns: minmax\(0, 1\.55fr\) minmax\(210px, 1fr\)/);
  assert.doesNotMatch(resultsSource, /setTimeout\([^)]*close\(\)/,
    'the card stays up until the player chooses');
  assert.match(resultsSource, /data-action="town"/);
  assert.match(resultsSource, /data-action="vote"/);
  assert.match(resultsSource, /min-height: 40px/, 'touch targets stay usable on a phone');
  assert.match(resultsSource, /setAttribute\('aria-modal', 'true'\)/);
});

test('the arena crowd reacts to kills and round swings', () => {
  const audioSource = readFileSync(
    new URL('../src/sideview/engine/AudioManager.ts', import.meta.url),
    'utf8',
  );
  assert.match(audioSource, /public playCrowdCheer\(intensity: number = 1\)/);
  assert.ok(audioSource.includes('/assets/audio/sfx/cheer-crowd.ogg'));
  assert.match(engineSource, /audio\.playCrowdCheer\(0\.8\)/, 'a kill draws a crowd reaction');
  assert.match(engineSource, /this\.pvpLastCrowdRound !== match\.currentRound/,
    'a settled round cheers once, not on every frame');
});

test('the arena hides dungeon furniture but keeps the combat HUD', () => {
  const hudSource = readFileSync(
    new URL('../src/sideview/ui/GameHUD.ts', import.meta.url),
    'utf8',
  );
  const css = hudSource.slice(
    hudSource.indexOf('.hud-pvp .mini-quest-tracker'),
    hudSource.indexOf('.hud-pvp .mini-quest-tracker') + 700,
  );
  for (const widget of ['.mini-quest-tracker', '#team-lives-badge', '.currency-stack', '.dungeon-run-status']) {
    assert.ok(css.includes(widget), `${widget} describes a dungeon run, not a duel`);
  }
  assert.ok(!css.includes('hud-hp-bar'), 'the health bar must survive the clean layout');
  assert.match(hudSource, /public setPvpMode\(active: boolean\): void \{/);
  assert.match(gameSource, /this\.hud\?\.setPvpMode\(true\);/);
  assert.match(gameSource, /this\.hud\?\.setPvpMode\(false\);/);
});

test('a downed fighter follows a living teammate, and the shot is a clean cut', () => {
  assert.match(engineSource, /private updateSpectatorCamera\(dt: number\): void \{/);
  assert.match(engineSource, /if \(this\.inTournamentMode && this\.player\.downed\) \{\s*this\.updateSpectatorCamera\(dt\);/,
    'the spectator camera has to be applied after the player camera');
  assert.match(engineSource, /remote\.team !== this\.pvpTeam/,
    'the camera must never follow the enemy team');
  assert.match(engineSource, /private static readonly PVP_DIRECTOR_INTERVAL = 4\.2;/,
    'the auto-director holds a shot before cutting again');
  assert.match(engineSource, /this\.pvpSpectateId = null;\s*this\.pvpDirectorTimer = 0;/,
    'a new round resets the spectator shot');
  assert.match(engineSource, /SPECTATING /, 'the strip names whose eyes you are using');
});

test('the lobby shows the Colosseum record and the arena says who dropped', () => {
  const lobbySource = readFileSync(
    new URL('../src/sideview/ui/TournamentLobbyUI.ts', import.meta.url),
    'utf8',
  );
  assert.match(lobbySource, /const record = loadPvpRecord\(\);/);
  assert.match(lobbySource, /pvp-career-chip/);
  assert.match(lobbySource, /@media \(max-width: (?:900|720)px\) \{[\s\S]{0,400}\.pvp-career-chip \{ display: none; \}/,
    'the chip is the first thing to go on a phone header');
  assert.match(networkSource, /onPvpPeerDroppedCb\?\.\(dropped\?\.name/,
    'the name is read before the remote state is deleted');
  assert.match(gameSource, /disconnected — their slot is held for 45s/);
});

test('arena quick chat is a team channel', () => {
  const chat = serverSource.slice(
    serverSource.indexOf("socket.on('party_chat'"),
    serverSource.indexOf("socket.on('party_ping'"),
  );
  assert.match(chat, /if \(room && room\.isPvp && room\.started\)/);
  assert.match(chat, /pvpTeamOf\(room, memberId\) !== team/,
    'the enemy must not receive team callouts');
  assert.match(chat, /return;/, 'the team branch must not fall through to a room-wide broadcast');
});

test('the record rides in the cloud save and has a Colosseum board', () => {
  const saveSource = readFileSync(
    new URL('../src/sideview/engine/SaveManager.ts', import.meta.url),
    'utf8',
  );
  assert.match(saveSource, /pvp: loadPvpRecord\(\)/,
    'the whitelist is the only thing that reaches the cloud save');
  assert.match(engineSource, /if \(ps\.pvp\) \{\s*savePvpRecord\(mergePvpRecords\(loadPvpRecord\(\), coercePvpRecord\(ps\.pvp\)\)\);/,
    'the loader has to restore what the whitelist writes, and never roll a win back');

  const boardSource = readFileSync(
    new URL('../src/sideview/ui/LeaderboardUI.ts', import.meta.url),
    'utf8',
  );
  assert.match(boardSource, /data-sort="pvp">Colosseum</, 'the board must be reachable from the game');
  assert.match(boardSource, /'Your Record'/);
  assert.match(boardSource, /wins: Math\.max\(0, Math\.trunc\(finiteNumber\(source\.wins\)\)\)/);

  assert.match(serverSource, /const byPvp = req\.query\.sort === 'pvp';/);
  assert.match(serverSource, /pvpOf\(u\)\.matches > 0/,
    'a board of players who never fought is noise');
  assert.match(serverSource, /ORDER BY pvp_wins DESC, pvp_best_streak DESC/, 'wins lead, streaks break ties');
  assert.match(serverSource, /'pvp'->>'wins'/, 'the SQL board reads the record out of the save');
});

test('merging a stale cloud record never removes a win', () => {
  const local = coercePvpRecord({
    matches: 8, wins: 5, losses: 3, bestStreak: 3, mvps: 2, roundsWon: 11, roundsLost: 7,
    winStreak: 2, suddenDeathWins: 1, lastWinDay: '2026-10-17', goldEarned: 9000,
  });
  const cloud = coercePvpRecord({
    matches: 6, wins: 4, losses: 2, bestStreak: 4, mvps: 3, roundsWon: 9, roundsLost: 5,
    winStreak: 1, suddenDeathWins: 0, lastWinDay: '2026-10-16', goldEarned: 12000,
  });
  const merged = mergePvpRecords(local, cloud);
  assert.equal(merged.matches, 8, 'the further career wins on matches');
  assert.equal(merged.wins, 5, 'a win is never rolled back');
  assert.equal(merged.bestStreak, 4, 'the better streak survives from either copy');
  assert.equal(merged.mvps, 3);
  assert.equal(merged.goldEarned, 12000);
  assert.equal(merged.lastWinDay, '2026-10-17', 'the latest win day wins');
  assert.deepEqual(coercePvpRecord(null), defaultPvpRecord());
  assert.equal(coercePvpRecord({ wins: -3, losses: 'x' }).wins, 0);
});

test('the arena rating is derivable from the visible record', () => {
  const empty = defaultPvpRecord();
  assert.equal(pvpRating(empty), 1000, 'a new challenger starts at 1000');
  const winning = { ...empty, matches: 10, wins: 7, losses: 3, bestStreak: 4 };
  const losing = { ...empty, matches: 10, wins: 2, losses: 8, bestStreak: 1 };
  assert.ok(pvpRating(winning) > 1000, 'a winning career rates above the start');
  assert.ok(pvpRating(losing) < 1000, 'a losing career rates below it');
  assert.ok(pvpRating(losing) >= 100, 'the rating never goes negative');
  assert.match(resultsSource, /pvpRating\(record\)/, 'the card must show the figure it derives');
  assert.match(resultsSource, /arena rating/);
});

test('the results card brackets every settled round', () => {
  assert.match(resultsSource, /private seriesChips\(\): string \{/);
  assert.match(resultsSource, /R\$\{round\.roundNumber\}/);
  assert.match(resultsSource, /round\.reason === 'sudden_death'[\s\S]{0,80}'OT'/,
    'an overtime round is marked on the bracket');
  assert.match(resultsSource, /const winner = round\.winner === 'red' \|\| round\.winner === 'blue' \? round\.winner : 'draw';/);
  assert.match(resultsSource, /class="pvp-res-series"/);
});

test('a bench spectator sees the board, not a purse or a rating change', () => {
  assert.match(resultsSource, /spectator\?: boolean;/);
  assert.match(resultsSource, /MATCH COMPLETE/);
  assert.match(resultsSource, /No rating change/);
  assert.match(resultsSource, /You watched this bout from the bench/);
  assert.match(resultsSource, /needed > 0 && !spectating/,
    'a spectator does not vote on a rematch they are not fighting');
  assert.match(gameSource, /const spectating = this\.engine\.pvpObserver;/);
  assert.match(gameSource, /if \(!spectating\) savePvpRecord\(settlement\.record\);/,
    'watching must not count as a loss on the record');
  assert.match(gameSource, /setPvpObserver\(spectating\)/);
});
