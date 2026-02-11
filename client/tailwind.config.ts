import type { Config } from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(222.2 84% 4.9%)',
        foreground: 'hsl(210 40% 98%)',
        card: 'hsl(222.2 84% 4.9%)',
        muted: 'hsl(217.2 32.6% 17.5%)',
        border: 'hsl(217.2 32.6% 17.5%)',
        primary: 'hsl(210 40% 98%)',
        'primary-foreground': 'hsl(222.2 47.4% 11.2%)'
      }
    }
  },
  plugins: [],
} satisfies Config;
