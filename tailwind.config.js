/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['class', '[data-theme]'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        panel: 'var(--panel)',
        'panel-glass': 'var(--panel-glass)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        primary: 'var(--text)',
        muted: 'var(--muted)',
        accent: 'var(--accent)',
        'accent-muted': 'var(--accent-muted)',
        ok: 'var(--ok)',
        'ok-muted': 'var(--ok-muted)',
        warn: 'var(--warn)',
        'warn-muted': 'var(--warn-muted)',
        danger: 'var(--danger)',
        'danger-muted': 'var(--danger-muted)',
        closed: 'var(--closed)',
        'closed-muted': 'var(--closed-muted)',
        info: 'var(--info)',
        'info-muted': 'var(--info-muted)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        'glow-accent': 'var(--glow-accent)',
        'glow-danger': 'var(--glow-danger)',
        'glow-warn': 'var(--glow-warn)',
        'glow-ok': 'var(--glow-ok)',
      },
    },
  },
  plugins: [],
};
