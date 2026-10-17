/**
 * Practice opponents for the Colosseum.
 *
 * A PvP lobby needs a second person, which means the mode is unplayable when
 * nobody else is online - the one time a player most wants to learn the
 * arena. These bots are the smallest honest opponent: they walk toward you,
 * swing when you are in reach, and die when their health runs out. They do
 * not pretend to be players (the results card tags them BOT), and they never
 * exist in a real match.
 *
 * The stepping function is pure so the timing can be tested without a canvas.
 */
import type { TournamentFighter } from './TournamentSystem';

export interface ArenaBot {
  id: string;
  name: string;
  classId: string;
  team: 'red' | 'blue';
  x: number;
  spawnX: number;
  facing: 1 | -1;
  hp: number;
  maxHp: number;
  downed: boolean;
  attackCooldown: number;
  /** A short pause after the round starts, so the player is not jumped. */
  reactionTimer: number;
  moving: boolean;
}

export const ARENA_BOT = {
  speed: 168,
  /** It swings from here; also the stand-off distance it tries to keep. */
  attackRange: 82,
  attackCooldown: 1.35,
  /** Raw damage before the player's defence. ~60 net against a normal build. */
  damage: 85,
  engageDelay: 1.1,
} as const;

const ARENA_BOUNDS = { min: 60, max: 3400 } as const;

export function createArenaBot(fighter: TournamentFighter, spawnX: number): ArenaBot {
  return {
    id: fighter.id,
    name: fighter.name,
    classId: fighter.className,
    team: fighter.team,
    x: spawnX,
    spawnX,
    facing: fighter.team === 'red' ? 1 : -1,
    hp: Math.max(1, fighter.maxHp),
    maxHp: Math.max(1, fighter.maxHp),
    downed: false,
    attackCooldown: ARENA_BOT.attackCooldown * 0.5,
    reactionTimer: ARENA_BOT.engageDelay,
    moving: false,
  };
}

export interface BotStepResult {
  attack: boolean;
  damage: number;
}

/**
 * Advance one bot by `dt` toward a target.
 *
 * Mutates the bot's position, facing and cooldowns; the caller applies the
 * returned hit. A downed bot does nothing, which keeps a dead opponent from
 * swinging from the floor while the round banner is still up.
 */
export function stepArenaBot(
  bot: ArenaBot,
  target: { x: number; downed: boolean; hp: number },
  dt: number,
  bounds: { min: number; max: number } = ARENA_BOUNDS,
): BotStepResult {
  bot.moving = false;
  if (bot.downed) return { attack: false, damage: 0 };

  bot.attackCooldown = Math.max(0, bot.attackCooldown - dt);

  if (bot.reactionTimer > 0) {
    bot.reactionTimer = Math.max(0, bot.reactionTimer - dt);
    return { attack: false, damage: 0 };
  }

  const dx = target.x - bot.x;
  const distance = Math.abs(dx);
  if (distance > 1) bot.facing = dx >= 0 ? 1 : -1;

  // Stop just inside reach instead of standing on the player.
  const standOff = ARENA_BOT.attackRange * 0.72;
  if (distance > standOff) {
    const step = Math.min(ARENA_BOT.speed * dt, distance - standOff);
    if (step > 0) {
      bot.x = Math.max(bounds.min, Math.min(bounds.max, bot.x + Math.sign(dx) * step));
      bot.moving = true;
    }
  }

  const canHit = distance <= ARENA_BOT.attackRange
    && bot.attackCooldown <= 0
    && !target.downed
    && target.hp > 0;
  if (!canHit) return { attack: false, damage: 0 };

  bot.attackCooldown = ARENA_BOT.attackCooldown;
  return { attack: true, damage: ARENA_BOT.damage };
}

/** Put a bot back on its mark for the next round. */
export function resetArenaBot(bot: ArenaBot): void {
  bot.hp = bot.maxHp;
  bot.x = bot.spawnX;
  bot.facing = bot.team === 'red' ? 1 : -1;
  bot.downed = false;
  bot.moving = false;
  bot.attackCooldown = ARENA_BOT.attackCooldown * 0.5;
  bot.reactionTimer = ARENA_BOT.engageDelay;
}
