// FOUNDRY YARD — the look plan in one place. A dusk industrial depot: cold slate and
// concrete, rusted steel, one amber accent. Team colours are the only other hues.
// The same names are the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#10141a', // sky / fog
  ground: '#2b3038', // concrete floor
  concrete: '#49525e', // walls, silos
  steel: '#5d6b78', // containers, girders
  rust: '#8a5a33', // rusted crates and pipes
  hazard: '#e8a13a', // amber accent: site markers, spike, UI accent
  ink: '#ece7db', // text, lights
  muted: '#8b98a3', // secondary text
  ally: '#4aa3ff', // VANGUARD blue
  enemy: '#ff5a4e', // EMBER red
  grass: '#2e4a3a', // mossy ground patches (kept dark)
};

export function mat(color, roughness = 0.9, metalness = 0.05) {
  return { color, roughness, metalness };
}
