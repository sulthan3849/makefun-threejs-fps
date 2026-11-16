# makefun-threejs-fps

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/sulthan3849/makefun-threejs-fps/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/sulthan3849/makefun-threejs-fps/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A playable three.js tactical FPS — 5v5 plant-and-defuse with bot squads, rounds, and a full HUD — built for make.fun's $1,000 bounty.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. Click to play: WASD to move, mouse to look, click to fire, R to reload, B for the buy menu, E to plant the spike, G to throw a grenade.

## The game

**FOUNDRY YARD** — an original dusk-lit industrial depot. VANGUARD (you + 4 bots) attacks; EMBER (5 bots) defends. Plant the spike at Site A or Site B, or eliminate the other squad. First to 5 rounds takes the match.

- Gunplay: hitscan weapons with headshot multipliers, recoil and spread that punish firing on the move, acceleration-based movement with crouch and jump, AABB collision with the map.
- Tactics: plant/defuse objective, round economy ($800 start, kill and win bonuses), buy menu (SMG, rifle, sniper, frag grenade, kevlar), and bots that follow waypoint routes, hold sites, react to sight and gunfire, and rotate on a plant.
- Presentation: a three-lane map with containers, silos and a jumpable mid platform, dusk sun with shadows, synthesized WebAudio gunfire and effects (no audio assets), and a full HUD — health, armour, ammo, money, timer, score, alive counts, kill feed, crosshair spread, hit markers and plant progress.

---

<sub>Entered on [make.fun](https://make.fun/?ref=fzwc18fj&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
