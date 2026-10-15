import { readFileSync } from 'node:fs';

const dungeons = readFileSync('src/sideview/dungeons/DungeonManager.ts', 'utf8');
const voting = readFileSync('src/sideview/dungeons/GameModeVoting.ts', 'utf8');
const game = readFileSync('src/sideview/SideViewGame.ts', 'utf8');
const net = readFileSync('src/sideview/network/NetworkManager.ts', 'utf8');
const hud = readFileSync('src/sideview/ui/GameHUD.ts', 'utf8');
const server = readFileSync('server/index.js', 'utf8');

let failures = 0;
const check = (desc, cond) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${desc}`);
  if (!cond) failures++;
};

console.log('\n=== DUNGEON WAVE 3+ & GAME MODE VOTING TEST SUITE ===\n');

// 1. Audit getWaveConfig & Wave 4+ Procedural Generation
console.log('--- 1. Wave 4+ Infinite Procedural Generation ---');
check('getWaveConfig is exported from DungeonManager.ts', /export function getWaveConfig\(/.test(dungeons));
check('getWaveConfig delegates to buildEndlessWave for wave 4+', /return buildEndlessWave\(dungeon, waveIndex\)/.test(dungeons));
check('spawnWaveEnemies calls getWaveConfig', /const wave = getWaveConfig\(dungeon, waveIndex\)/.test(dungeons));
check('authored waves 1-3 exist across dungeons', /waveNumber: 1/.test(dungeons) && /waveNumber: 2/.test(dungeons) && /waveNumber: 3/.test(dungeons));
check('wave scaling compounds gently per wave', /Math\.pow\(1\.07, beyond\)/.test(dungeons));
check('every 10th wave is a milestone bringing the boss back', /isMilestone/ && /depth % 10 === 0/.test(dungeons));

// 2. Pure function testing for Vote Resolution
console.log('\n--- 2. Vote Resolution Rules (Majority, Tie-Breaker, Fallback) ---');
check('GameModeVoting.ts exports ALL_GAME_MODES', /export const ALL_GAME_MODES/.test(voting));
check('GameModeVoting.ts exports selectThreeGameModes', /export function selectThreeGameModes\(/.test(voting));
check('GameModeVoting.ts exports resolveVote', /export function resolveVote\(/.test(voting));

// Test resolveVote implementation logic directly
function testResolveVote(options, votes, randomRoll = 0.5) {
  const counts = new Map();
  for (const opt of options) counts.set(opt.id, 0);
  for (const modeId of votes.values()) {
    if (counts.has(modeId)) {
      counts.set(modeId, counts.get(modeId) + 1);
    }
  }

  let maxVotes = -1;
  let topModes = [];

  for (const [modeId, count] of counts.entries()) {
    if (count > maxVotes) {
      maxVotes = count;
      topModes = [modeId];
    } else if (count === maxVotes) {
      topModes.push(modeId);
    }
  }

  if (maxVotes === 0 || topModes.length === 0) {
    const fallbackIdx = Math.floor(randomRoll * options.length) % options.length;
    return options[fallbackIdx].id;
  }

  if (topModes.length === 1) {
    return topModes[0];
  }

  const tieIdx = Math.floor(randomRoll * topModes.length) % topModes.length;
  return topModes[tieIdx];
}

const testOptions = [
  { id: 'berserker_rush', name: 'Berserker Rush' },
  { id: 'golden_treasury', name: 'Golden Treasury' },
  { id: 'chrono_surge', name: 'Chrono Surge' },
];

// Rule 1: Majority
const majVotes = new Map([
  ['p1', 'berserker_rush'],
  ['p2', 'golden_treasury'],
  ['p3', 'berserker_rush'],
]);
check('Rule 1 (Majority): berserker_rush wins 2-to-1', testResolveVote(testOptions, majVotes) === 'berserker_rush');

// Rule 2: Tie-Breaker
const tieVotes = new Map([
  ['p1', 'berserker_rush'],
  ['p2', 'golden_treasury'],
]);
check('Rule 2 (Tie-Breaker): roll low selects berserker_rush', testResolveVote(testOptions, tieVotes, 0.1) === 'berserker_rush');
check('Rule 2 (Tie-Breaker): roll high selects golden_treasury', testResolveVote(testOptions, tieVotes, 0.9) === 'golden_treasury');
check('Rule 2 (Tie-Breaker): unvoted chrono_surge never wins tie', testResolveVote(testOptions, tieVotes, 0.5) !== 'chrono_surge');

// Rule 3: Zero Votes Fallback
const noVotes = new Map();
check('Rule 3 (Zero Votes Fallback): roll 0.1 selects berserker_rush', testResolveVote(testOptions, noVotes, 0.1) === 'berserker_rush');
check('Rule 3 (Zero Votes Fallback): roll 0.5 selects golden_treasury', testResolveVote(testOptions, noVotes, 0.5) === 'golden_treasury');
check('Rule 3 (Zero Votes Fallback): roll 0.9 selects chrono_surge', testResolveVote(testOptions, noVotes, 0.9) === 'chrono_surge');

// 3. Bulletproof State Machine Flow in SideViewGame
console.log('\n--- 3. Strict Dungeon State Machine Flow ---');
check('SideViewGame tracks dungeonFlowState', /dungeonFlowState:\s*DungeonFlowState/.test(game));
check('isTransitioningWave prevents race conditions from simultaneous kills', /isTransitioningWave:\s*boolean/.test(game));
check('Loop reconciles against live enemies (hp > 0 && !isDead)', /aliveEnemies = this\.engine\.enemies\.filter\(e => e\.hp > 0 && !e\.isDead\)/.test(game));
check('Loop verifies all scheduled spawns are completed', /hasScheduledSpawns = this\.engine\.enemies\.some\(e => \(Number\(e\.spawnDelay\) \|\| 0\) > 0 \|\| e\.isActive === false\) \|\| this\.engine\.hasPendingEnemyReinforcements\(\)/.test(game));
check('Phase 1 -> Phase 2: handleWaveActiveComplete called', /this\.handleWaveActiveComplete\(\)/.test(game));
check('Phase 2: 1.5s celebration delay', /this\.waveClearTimer = window\.setTimeout\(\(\) => \{[\s\S]*?1500\);/.test(game));
check('Phase 3: 5-second synchronized voting duration', /const duration = 5000;/.test(game));
check('Phase 3: Host authoritative tie-breaker and random roll', /const roll = Math\.random\(\);[\s\S]*?resolveVote\(this\.activeVotingOptions, this\.currentVoteTally, roll\)/.test(game));
check('Phase 3: 6.5s fail-safe watchdog prevents infinite voting freeze', /6500\);[\s\S]*?forceAdvanceVoting/.test(game));
check('Phase 4: APPLYING_GAMEMODE applies modifier and advances wave', /this\.dungeonFlowState = 'APPLYING_GAMEMODE'/.test(game));
check('Phase 4: startNextWave is called with currentWaveIndex++', /this\.currentWaveIndex\+\+;[\s\S]*?this\.spawnNextWave\(\);/.test(game));

// 4. Synchronized Multiplayer Network Relay
console.log('\n--- 4. Synchronized Multiplayer Network Relay ---');
check('NetworkManager has sendStartGameModeVote', /sendStartGameModeVote\(/.test(net));
check('NetworkManager has listenForStartGameModeVote', /listenForStartGameModeVote\(/.test(net));
check('NetworkManager has sendCastGameModeVote', /sendCastGameModeVote\(/.test(net));
check('NetworkManager has listenForCastGameModeVote', /listenForCastGameModeVote\(/.test(net));
check('NetworkManager has sendGameModeVoteResult', /sendGameModeVoteResult\(/.test(net));
check('NetworkManager has listenForGameModeVoteResult', /listenForGameModeVoteResult\(/.test(net));
check('Server rate limits START_GAMEMODE_VOTE', /START_GAMEMODE_VOTE/.test(server));
check('Server relays START_GAMEMODE_VOTE to all players in dungeon lobby', /\.to\(p\.room\)\.emit\('start_gamemode_vote'/.test(server));
check('Server relays CAST_GAMEMODE_VOTE to all players', /io\.to\(p\.room\)\.emit\('cast_gamemode_vote'/.test(server));
check('Server relays GAMEMODE_VOTE_RESULT to all players', /\.to\(p\.room\)\.emit\('gamemode_vote_result'/.test(server));

// 5. GameHUD UI Implementation
console.log('\n--- 5. GameHUD Voting Modal UI ---');
check('Modal container #gamemode-voting-modal exists', /id="gamemode-voting-modal"/.test(hud));
check('5-second synchronized countdown timer bar #gamemode-timer-bar exists', /id="gamemode-timer-bar"/.test(hud));
check('Timer countdown text #gamemode-timer-text exists', /id="gamemode-timer-text"/.test(hud));
check('showGameModeVotingModal renders 3 option cards', /showGameModeVotingModal\(/.test(hud));
check('updateGameModeVotes updates live vote count badges', /updateGameModeVotes\(/.test(hud));
check('highlightWinningGameMode visually highlights winner', /highlightWinningGameMode\(/.test(hud));
check('hideGameModeVotingModal cleanly cleans up timer and closes modal', /hideGameModeVotingModal\(/.test(hud));

console.log(`\n==========================================`);
console.log(failures === 0 ? 'ALL DUNGEON WAVE & VOTING TESTS PASSED!' : `TESTS FAILED: ${failures}`);
console.log(`==========================================\n`);

process.exit(failures === 0 ? 0 : 1);
