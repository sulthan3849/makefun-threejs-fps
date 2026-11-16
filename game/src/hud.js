// The DOM HUD: health, armour, ammo, money, timer, score, alive counts, kill feed,
// crosshair, hit marker, damage vignette, buy menu and every overlay. It never
// touches the simulation; game.js pushes numbers in and reads callbacks out.
import { BUY_ITEMS } from './game.js';

const COPY = {
  start: {
    title: 'FOUNDRY YARD',
    copy: 'Five against five. Plant the spike at Site A or Site B — or stop the other team from doing it. First to 5 rounds takes the match.',
    action: 'Click to play',
  },
  paused: {
    title: 'FOUNDRY YARD',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const ammoBox = $('ammo');
  const weaponName = $('weapon-name');
  const healthFill = $('health-fill');
  const healthNum = $('health-num');
  const armorNum = $('armor-num');
  const moneyVal = $('money-value');
  const timerVal = $('timer-value');
  const timerBox = $('timer');
  const scoreAtk = $('score-atk');
  const scoreDef = $('score-def');
  const aliveAtk = $('alive-atk');
  const aliveDef = $('alive-def');
  const feedEl = $('killfeed');
  const hitmarker = $('hitmarker');
  const crosshair = $('crosshair');
  const vignette = $('vignette');
  const damageDir = $('damage-dir');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const buyMenu = $('buy-menu');
  const buyMoney = $('buy-money');
  const buyItems = $('buy-items');
  const roundEnd = $('round-end');
  const roundEndTitle = $('round-end-title');
  const roundEndSub = $('round-end-sub');
  const roundEndScore = $('round-end-score');
  const matchEnd = $('match-end');
  const matchEndTitle = $('match-end-title');
  const matchEndScore = $('match-end-score');
  const plantBar = $('plant-bar');
  const plantFill = $('plant-fill');
  const plantLabel = $('plant-label');
  const spikeChip = $('spike-chip');
  const grenadeVal = $('grenade-count');

  let hitTimer = 0;
  let bannerTimer = 0;
  let last = {};

  function setText(el, key, value) {
    if (last[key] !== value) {
      last[key] = value;
      el.textContent = value;
    }
  }

  // Build the buy menu once from the same BUY_ITEMS table the game prices from.
  for (const item of BUY_ITEMS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'buy-item';
    button.dataset.item = item.id;
    button.innerHTML = `<span class="buy-key">${item.key.replace('Digit', '')}</span><span class="buy-label">${item.label}</span><span class="buy-price">$${item.price}</span>`;
    buyItems.appendChild(button);
  }

  return {
    setAmmo(mag, reserve) {
      setText(ammoMag, 'mag', String(mag));
      setText(ammoReserve, 'reserve', `/ ${reserve}`);
      ammoBox.classList.toggle('empty', mag === 0);
    },
    setWeaponName(name) {
      setText(weaponName, 'weapon', name);
    },
    setHealth(hp, armor) {
      const h = Math.max(0, Math.round(hp));
      setText(healthNum, 'hp', String(h));
      setText(armorNum, 'armor', armor > 0 ? `+${Math.round(armor)}` : '');
      healthFill.style.width = `${h}%`;
      healthFill.classList.toggle('low', h <= 30);
    },
    setMoney(value) {
      setText(moneyVal, 'money', `$${value}`);
      setText(buyMoney, 'buyMoney', `$${value}`);
    },
    setTimer(seconds, phase, planted) {
      const s = Math.max(0, Math.ceil(seconds));
      const mm = Math.floor(s / 60);
      const ss = String(s % 60).padStart(2, '0');
      setText(timerVal, 'timer', `${mm}:${ss}`);
      timerBox.classList.toggle('planted', !!planted);
      timerBox.classList.toggle('buy', phase === 'buy');
    },
    setScore(atk, def) {
      setText(scoreAtk, 'sAtk', String(atk));
      setText(scoreDef, 'sDef', String(def));
    },
    setAlive(atk, def) {
      setText(aliveAtk, 'aAtk', '●'.repeat(atk) + '○'.repeat(5 - atk));
      setText(aliveDef, 'aDef', '●'.repeat(def) + '○'.repeat(5 - def));
    },
    setKillfeed(entries) {
      feedEl.innerHTML = entries.map((e) =>
        `<div class="feed-row"><span class="feed-killer">${e.killer}</span><span class="feed-weapon">${e.headshot ? '◎ ' : ''}${e.weaponName}</span><span class="feed-victim">${e.victim}</span></div>`).join('');
    },
    setGrenades(n) {
      setText(grenadeVal, 'nades', n > 0 ? `◉ ×${n}` : '');
    },
    setSpike(carrying, planted, site) {
      setText(spikeChip, 'spike', planted ? `SPIKE LIVE — SITE ${site}` : carrying ? 'YOU CARRY THE SPIKE' : '');
      spikeChip.classList.toggle('live', !!planted);
      spikeChip.classList.toggle('carry', !!carrying && !planted);
    },
    setPlantProgress(p) {
      plantBar.hidden = p <= 0;
      if (p > 0) {
        plantFill.style.width = `${Math.round(p * 100)}%`;
        setText(plantLabel, 'plantLabel', 'PLANTING SPIKE…');
      }
    },
    setCrosshairSpread(px) {
      crosshair.style.setProperty('--gap', `${px}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', !!killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    flashDamage(headshot) {
      vignette.classList.remove('flash');
      void vignette.offsetWidth;
      vignette.classList.add('flash');
      vignette.classList.toggle('head', !!headshot);
    },
    damageFrom(attacker) {
      if (!attacker || attacker.isPlayer) return;
      damageDir.style.opacity = '1';
      clearTimeout(damageDir._t);
      damageDir._t = setTimeout(() => { damageDir.style.opacity = '0'; }, 600);
    },
    announce(text, sub) {
      bannerTitle.textContent = text;
      bannerSub.textContent = sub || '';
      banner.classList.remove('show');
      void banner.offsetWidth;
      banner.classList.add('show');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => banner.classList.remove('show'), 2600);
    },
    hideBanner() {
      clearTimeout(bannerTimer);
      banner.classList.remove('show');
    },
    showOverlay(mode) {
      const text = COPY[mode] || COPY.start;
      title.textContent = text.title;
      copy.textContent = text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    showBuyMenu(onBuy) {
      buyMenu.hidden = false;
      buyMenu.querySelectorAll('.buy-item').forEach((b) => {
        b.onclick = () => onBuy(b.dataset.item);
      });
    },
    hideBuyMenu() {
      buyMenu.hidden = true;
    },
    showRoundEnd(won, reason, atk, def) {
      roundEndTitle.textContent = won ? 'ROUND WON' : 'ROUND LOST';
      roundEndTitle.className = won ? 'won' : 'lost';
      roundEndSub.textContent = reason;
      roundEndScore.textContent = `${atk} — ${def}`;
      roundEnd.hidden = false;
    },
    hideRoundEnd() {
      roundEnd.hidden = true;
    },
    showMatchEnd(won, atk, def) {
      matchEndTitle.textContent = won ? 'MATCH WON' : 'MATCH LOST';
      matchEndTitle.className = won ? 'won' : 'lost';
      matchEndScore.textContent = `VANGUARD ${atk} — ${def} EMBER`;
      matchEnd.hidden = false;
    },
    hideMatchEnd() {
      matchEnd.hidden = true;
    },
  };
}
