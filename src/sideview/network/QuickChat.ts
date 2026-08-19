/**
 * Canned party messages.
 *
 * Voice chat exists but excludes the people this game is mostly played by: a
 * phone in landscape, no headset, often no microphone at all. These are the
 * six things a party actually needs to say, as one tap each.
 *
 * Only the id travels on the wire. Nothing a player types is ever relayed, so
 * there is no free-text channel to moderate.
 */
export interface QuickChatLine {
  id: string;
  /** What the sender picks from. */
  label: string;
  /** What appears over their head, kept short enough to read mid-fight. */
  bubble: string;
  color: string;
}

export const QUICK_CHAT: QuickChatLine[] = [
  { id: 'help',    label: 'Help!',        bubble: 'HELP!',        color: '#ef4444' },
  { id: 'attack',  label: 'Attack!',      bubble: 'ATTACK!',      color: '#fb923c' },
  { id: 'ready',   label: 'Ready',        bubble: 'READY!',       color: '#4ade80' },
  { id: 'careful', label: 'Careful!',     bubble: 'CAREFUL!',     color: '#facc15' },
  { id: 'regroup', label: 'Regroup',      bubble: 'REGROUP',      color: '#60a5fa' },
  { id: 'thanks',  label: 'Thanks!',      bubble: 'THANKS!',      color: '#c084fc' },
];

export const quickChatById = (id: string): QuickChatLine | undefined =>
  QUICK_CHAT.find(l => l.id === id);
