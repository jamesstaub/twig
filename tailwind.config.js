module.exports = {
  content: [
    './index.html',
    './**/*.html',
    './js/**/*.js'
  ],
  safelist: [
    'md:flex-row',
    'md:gap-4',
    'xl:grid',
    'xl:grid-cols-2',
    'xl:gap-6',
    'lg:w-1/2'
  ],
  theme: {
    extend: {
      screens: {
        'xs': '480px'
      },
      colors: {
        'deep-blue': '#0d131f',
        'navy': '#1a2332',
        'accent-blue': '#3b82f6',
        'accent-purple': '#8b5cf6',
        'text-primary': '#ffffff',
        'text-secondary': '#94a3b8'
      },
      fontFamily: {
        mono: ['Monaco', 'Menlo', 'Ubuntu Mono', 'monospace'],
        sans: ['Inter', 'sans-serif']
      }
    }
  }
};