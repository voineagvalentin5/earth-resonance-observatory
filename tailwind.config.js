/**
 * Tailwind configuration for the resonance dashboard.
 *
 * The dark sci‑fi HUD aesthetic relies on deep navy backgrounds and
 * bright neon accents. Custom colors defined here mirror the hues found
 * in the original design reference, enabling glow effects
 * and drop shadows throughout the UI. Tailwind's JIT engine will purge
 * unused styles based on the content globs below, ensuring the build
 * stays small.
 */
module.exports = {
  content: [
    './pages/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: '#020617',
        midnight: '#040a12',
        'neon-green': '#4affc8',
        'neon-cyan': '#00eaff',
        'neon-orange': '#ffa500',
        'neon-yellow': '#ffea00',
        'neon-red': '#ff5973',
        'panel-bg': '#0a1320',
      },
      boxShadow: {
        neon: '0 0 8px rgba(0, 234, 255, 0.6)',
        glow: '0 0 12px rgba(74, 255, 200, 0.8)',
      },
    },
  },
  plugins: [],
};