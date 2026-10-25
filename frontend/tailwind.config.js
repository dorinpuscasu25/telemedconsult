/**
 * Culorile temei sunt variabile CSS în oklch. Tailwind 3 nu poate aplica singur
 * opacitatea pe `var(--x)`, așa că `bg-primary/10` nu genera nimic. Funcția
 * folosește `color-mix` când clasa cere o opacitate.
 */
const withAlpha = (variable) => ({ opacityValue }) =>
  opacityValue === undefined || opacityValue === '1'
    ? `var(${variable})`
    : `color-mix(in oklch, var(${variable}) calc(${opacityValue} * 100%), transparent)`;

export default {content: [
  './index.html',
  './src/**/*.{js,ts,jsx,tsx}'
],
  darkMode: 'selector',
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px'
      }
    },
    extend: {
      colors: {
        background: withAlpha('--background'),
        foreground: withAlpha('--foreground'),
        card: withAlpha('--card'),
        'card-foreground': withAlpha('--card-foreground'),
        popover: withAlpha('--popover'),
        'popover-foreground': withAlpha('--popover-foreground'),
        primary: withAlpha('--primary'),
        'primary-foreground': withAlpha('--primary-foreground'),
        secondary: withAlpha('--secondary'),
        'secondary-foreground': withAlpha('--secondary-foreground'),
        muted: withAlpha('--muted'),
        'muted-foreground': withAlpha('--muted-foreground'),
        accent: withAlpha('--accent'),
        'accent-foreground': withAlpha('--accent-foreground'),
        destructive: withAlpha('--destructive'),
        border: withAlpha('--border'),
        input: withAlpha('--input'),
        ring: withAlpha('--ring'),
        'chart-1': withAlpha('--chart-1'),
        'chart-2': withAlpha('--chart-2'),
        'chart-3': withAlpha('--chart-3'),
        'chart-4': withAlpha('--chart-4'),
        'chart-5': withAlpha('--chart-5'),
        sidebar: withAlpha('--sidebar'),
        'sidebar-foreground': withAlpha('--sidebar-foreground'),
        'sidebar-primary': withAlpha('--sidebar-primary'),
        'sidebar-primary-foreground': withAlpha('--sidebar-primary-foreground'),
        'sidebar-accent': withAlpha('--sidebar-accent'),
        'sidebar-accent-foreground': withAlpha('--sidebar-accent-foreground'),
        'sidebar-border': withAlpha('--sidebar-border'),
        'sidebar-ring': withAlpha('--sidebar-ring'),
        'destructive-foreground': withAlpha('--destructive-foreground')
      },
      fontFamily: {
        heading: ['Geist'],
        mono: ['"Geist Mono"']
      }
    }
  }
}