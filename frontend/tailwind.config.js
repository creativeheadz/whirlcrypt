/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Old Forge family — ink/paper/ember tokens, both themes via :root + body.theme-night.
        // Tailwind defaults (gray, red-500, etc.) are intentionally preserved for legacy classes
        // during the reskin; new code should prefer ink/paper/ember.
        paper: {
          DEFAULT: 'var(--paper)',
          faint:   'var(--paper-faint)',
          deep:    'var(--paper-deep)',
        },
        ink: {
          DEFAULT: 'var(--ink)',
          soft:    'var(--ink-soft)',
          faint:   'var(--ink-faint)',
          veil:    'var(--ink-veil)',
        },
        ember: {
          DEFAULT: 'var(--ember)',
          soft:    'var(--ember-soft)',
          glow:    'var(--ember-glow)',
        },
        rule: {
          DEFAULT: 'var(--rule)',
          strong:  'var(--rule-strong)',
          faint:   'var(--rule-faint)',
        },
        led: {
          green: 'var(--green)',
          amber: 'var(--amber)',
          red:   'var(--red)',
          blue:  'var(--blue)',
        },
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'Consolas', 'Menlo', 'monospace'],
        sans: ['"JetBrains Mono"', 'Consolas', 'Menlo', 'monospace'],
      },
      // Sharp corners only — kill all rounded utility output
      borderRadius: {
        none: '0',
        sm:   '0',
        DEFAULT: '0',
        md:   '0',
        lg:   '0',
        xl:   '0',
        '2xl': '0',
        '3xl': '0',
        full: '0',
      },
    },
  },
  plugins: [],
}
