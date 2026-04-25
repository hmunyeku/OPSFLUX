import containerQueries from '@tailwindcss/container-queries'

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /* ── Semantic tokens via CSS variables ─────── */
        background: {
          DEFAULT: 'hsl(var(--background))',
          subtle: 'hsl(var(--background-subtle))',
          muted: 'hsl(var(--background-muted))',
        },
        foreground: {
          DEFAULT: 'hsl(var(--foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          light: 'hsl(var(--primary-light))',
          hover: 'hsl(var(--primary-hover))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        warning: 'hsl(var(--warning))',
        success: 'hsl(var(--success))',
        border: {
          DEFAULT: 'hsl(var(--border))',
          strong: 'hsl(var(--border-strong))',
        },
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        chrome: {
          DEFAULT: 'hsl(var(--chrome))',
          hover: 'hsl(var(--chrome-hover))',
          active: 'hsl(var(--chrome-active))',
        },
      },
      fontFamily: {
        /* Pajamas: GitLab Sans = Inter-based */
        sans: [
          'Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"',
          'Roboto', '"Noto Sans"', 'Ubuntu', 'sans-serif',
        ],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      /* ── Pajamas Typography Scale (rem-based) ──── */
      fontSize: {
        'xs':   ['0.75rem',    { lineHeight: '1.125rem' }],   // 12px / 18px
        'sm':   ['0.875rem',   { lineHeight: '1.25rem' }],    // 14px / 20px
        'base': ['1rem',       { lineHeight: '1.5rem' }],     // 16px / 24px
        'lg':   ['1.125rem',   { lineHeight: '1.75rem' }],    // 18px / 28px
        'xl':   ['1.3125rem',  { lineHeight: '1.75rem' }],    // 21px / 28px
        '2xl':  ['1.53125rem', { lineHeight: '2rem' }],       // 24.5px / 32px
        '3xl':  ['1.75rem',    { lineHeight: '2.25rem' }],    // 28px / 36px
        '4xl':  ['2.1875rem',  { lineHeight: '2.5rem' }],     // 35px / 40px
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        DEFAULT: 'var(--radius)',
      },
      spacing: {
        'topbar': 'var(--topbar-height)',
        'panel-header': 'var(--panel-header-height)',
        'sidebar-icons': 'var(--sidebar-width-icons)',
        'sidebar-expanded': 'var(--sidebar-width-expanded)',
      },
      boxShadow: {
        /* Pajamas elevation */
        'pajamas-sm': '0 1px 2px 0 rgba(0, 0, 0, 0.08)',
        'pajamas':    '0 2px 8px 0 rgba(0, 0, 0, 0.1)',
        'pajamas-lg': '0 4px 16px 0 rgba(0, 0, 0, 0.15)',
      },
      zIndex: {
        'sidebar':  'var(--z-sidebar)',
        'topbar':   'var(--z-topbar)',
        'dropdown': 'var(--z-dropdown)',
        'modal':    'var(--z-modal)',
        'toast':    'var(--z-toast)',
      },
    },
  },
  plugins: [
    containerQueries,
  ],
}
