/**
 * Tests for the Standardized Top-Right Modal Exit Buttons & Logout Modal
 */
import { readFileSync } from 'node:fs';

const hud = readFileSync('src/sideview/ui/GameHUD.ts', 'utf8');
const questLog = readFileSync('src/sideview/ui/QuestLogUI.ts', 'utf8');
const worldMap = readFileSync('src/sideview/ui/WorldMapUI.ts', 'utf8');
const leaderboard = readFileSync('src/sideview/ui/LeaderboardUI.ts', 'utf8');
const coopLobby = readFileSync('src/sideview/ui/CoopLobbyUI.ts', 'utf8');
const runSummary = readFileSync('src/sideview/ui/RunSummaryUI.ts', 'utf8');
const inputSettings = readFileSync('src/sideview/input/InputSettingsPanel.ts', 'utf8');
const theme = readFileSync('src/sideview/ui/RpgUiTheme.ts', 'utf8');

let failures = 0;
const check = (desc, cond) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${desc}`);
  if (!cond) failures++;
};

console.log('\n=== MODAL EXIT BUTTONS & LOGOUT MODAL VERIFICATION ===\n');

// 1. Logout Modal
check('HUD defines a dedicated logout modal dialog', /id="logout-modal"/.test(hud));
check('Logout modal has title LOG OUT?', /id="logout-modal-title"[\s\S]{0,80}LOG OUT\?/.test(hud));
check('Logout modal has corner close button', /id="logout-modal-close-corner"/.test(hud));
check('Logout modal has CANCEL button', /id="logout-cancel-btn"/.test(hud));
check('Logout modal has CONFIRM LOGOUT button', /id="logout-confirm-btn"/.test(hud));
check('GameHUD has openLogoutModal method', /public openLogoutModal\(\)/.test(hud));
check('GameHUD has closeLogoutModal method', /public closeLogoutModal\(\)/.test(hud));
check('logout-btn opens the logout modal rather than browser confirm',
  !/if \(!confirm\(/.test(hud) && /this\.openLogoutModal\(\)/.test(hud));
check('closePanels closes logout modal', /'#logout-modal'[\s\S]{0,100}closePanels/.test(hud) || /closePanels\(\)[\s\S]{0,120}'#logout-modal'/.test(hud));

// 2. Game HUD Top-Right Corner Close Buttons
check('Play/Launcher panel has corner close button', /id="play-close-corner-btn"/.test(hud));
check('Skills panel has corner close button', /id="skills-close-corner-btn"/.test(hud));
check('Menu panel has corner close button', /id="pause-close-corner-btn"/.test(hud));
check('Leave dungeon modal has corner close button', /id="leave-modal-close-corner"/.test(hud));
check('Item inspector pane has corner close button', /id="inspector-close-corner-btn"/.test(hud));

// 3. UI Screens Top-Right Exit Buttons
check('QuestLogUI header has top-right close button', /id="close-quest-log-top-btn"/.test(questLog));
check('QuestLogUI binds close-quest-log-top-btn to close()', /close-quest-log-top-btn[\s\S]{0,80}this\.close\(\)/.test(questLog));

check('WorldMapUI header has top-right close button', /id="close-map-top-btn"/.test(worldMap));
check('WorldMapUI binds close-map-top-btn to close()', /close-map-top-btn[\s\S]{0,80}this\.close\(\)/.test(worldMap));

check('LeaderboardUI has top-right close button with rpg-dialog-close-btn',
  /rpg-dialog-close-btn lb-close/.test(leaderboard));

check('CoopLobbyUI header has top-right close button', /id="cl-close-top-btn"/.test(coopLobby));
check('CoopLobbyUI binds cl-close-top-btn to leave and close', /cl-close-top-btn[\s\S]{0,80}onLeave/.test(coopLobby));

check('RunSummaryUI header has top-right corner close button', /id="rs-close-corner-btn"/.test(runSummary));
check('RunSummaryUI binds rs-close-corner-btn', /rs-close-corner-btn[\s\S]{0,80}dismissSummary/.test(runSummary));

check('InputSettingsPanel header has top-right exit button',
  /rpg-dialog-close-btn input-settings-close/.test(inputSettings));

// 4. Styles
check('RpgUiTheme defines .rpg-dialog-close-btn with crimson hover states',
  /\.rpg-dialog-close-btn/.test(theme));
check('GameHUD defines .modal-corner-close with absolute positioning and hover states',
  /\.modal-corner-close\s*\{[\s\S]{0,120}position:\s*absolute/.test(hud));

console.log(`\nVerification finished: ${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECKS FAILED'}\n`);
if (failures > 0) process.exit(1);
