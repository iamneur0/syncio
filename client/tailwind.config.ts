import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Theme colors via CSS variables
        // These enable Tailwind classes like: text-theme-primary, bg-theme-surface
        theme: {
          bg: 'var(--color-bg)',
          'bg-subtle': 'var(--color-bg-subtle)',
          'bg-muted': 'var(--color-bg-muted)',
          surface: 'var(--color-surface)',
          'surface-hover': 'var(--color-surface-hover)',
          'surface-border': 'var(--color-surface-border)',
          text: 'var(--color-text)',
          'text-muted': 'var(--color-text-muted)',
          'text-subtle': 'var(--color-text-subtle)',
          primary: 'var(--color-primary)',
          'primary-hover': 'var(--color-primary-hover)',
          'primary-muted': 'var(--color-primary-muted)',
          secondary: 'var(--color-secondary)',
          'secondary-muted': 'var(--color-secondary-muted)',
          success: 'var(--color-success)',
          'success-muted': 'var(--color-success-muted)',
          error: 'var(--color-error)',
          'error-muted': 'var(--color-error-muted)',
          warning: 'var(--color-warning)',
          'warning-muted': 'var(--color-warning-muted)',
          'chart-1': 'var(--color-chart-1)',
          'chart-2': 'var(--color-chart-2)',
          'chart-3': 'var(--color-chart-3)',
          'chart-4': 'var(--color-chart-4)',
        },
      },
      fontFamily: {
        display: ['var(--font-space-grotesk)', 'system-ui', 'sans-serif'],
        body: ['var(--font-outfit)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'monospace'],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      boxShadow: {
        'glow': '0 0 20px var(--color-primary-muted)',
        'glow-lg': '0 0 40px var(--color-primary-muted)',
        'glass': '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        'glass-hover': '0 12px 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
        'gradient-surface': 'linear-gradient(180deg, var(--color-surface), var(--color-bg-subtle))',
        'mesh-gradient': `
          radial-gradient(at 40% 20%, var(--color-primary-muted) 0px, transparent 50%),
          radial-gradient(at 80% 0%, var(--color-secondary-muted) 0px, transparent 50%),
          radial-gradient(at 0% 50%, var(--color-primary-muted) 0px, transparent 50%)
        `,
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'shimmer': 'shimmer 2s linear infinite',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        glow: {
          '0%': { opacity: '0.5' },
          '100%': { opacity: '1' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};

export default config;
