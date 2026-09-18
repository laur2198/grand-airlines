// Tailwind build config. Rebuild css/app.css with tools/build-css.cmd after changing classes.
module.exports = {
  darkMode: 'class',
  content: ['./index.html', './js/**/*.js'],
  theme: {
    extend: {
      colors: {
        'surface-dim': '#111317', 'error-container': '#93000a', 'on-primary-container': '#613b00',
        'secondary-fixed': '#c4e7ff', 'primary-fixed-dim': '#ffb95f', 'secondary': '#7bd0ff',
        'secondary-container': '#00a6e0', 'on-secondary-fixed': '#001e2c', 'surface-container-high': '#282a2d',
        'tertiary-fixed': '#dde3eb', 'primary': '#ffc174', 'on-tertiary': '#2b3137', 'on-primary-fixed': '#2a1700',
        'on-tertiary-fixed-variant': '#41474e', 'surface-container': '#1e2023', 'on-background': '#e2e2e6',
        'outline': '#a08e7a', 'on-error-container': '#ffdad6', 'inverse-on-surface': '#2f3034',
        'on-secondary-fixed-variant': '#004c69', 'surface-container-low': '#1a1c1f', 'on-primary': '#472a00',
        'inverse-surface': '#e2e2e6', 'tertiary-container': '#acb2b9', 'on-surface-variant': '#d8c3ad',
        'inverse-primary': '#855300', 'surface-variant': '#333538', 'surface-bright': '#37393d', 'on-error': '#690005',
        'primary-container': '#f59e0b', 'on-secondary': '#00354a', 'tertiary': '#c7cdd5', 'secondary-fixed-dim': '#7bd0ff',
        'outline-variant': '#534434', 'on-tertiary-container': '#3e454b', 'surface-container-lowest': '#0c0e11',
        'primary-fixed': '#ffddb8', 'background': '#111317', 'error': '#ffb4ab', 'surface-container-highest': '#333538',
        'tertiary-fixed-dim': '#c1c7cf', 'on-surface': '#e2e2e6', 'on-tertiary-fixed': '#161c22', 'surface-tint': '#ffb95f',
        'on-secondary-container': '#00374d', 'on-primary-fixed-variant': '#653e00', 'surface': '#111317'
      },
      borderRadius: { DEFAULT: '0.125rem', lg: '0.25rem', xl: '0.5rem', full: '0.75rem' },
      fontFamily: {
        'headline-lg': ['Barlow Condensed'], 'headline-md': ['Barlow Condensed'], 'headline-sm': ['Barlow Condensed'],
        'label-lg': ['JetBrains Mono'], 'label-md': ['JetBrains Mono'], 'label-sm': ['JetBrains Mono'],
        'body-lg': ['Space Grotesk'], 'body-md': ['Space Grotesk'], 'body-sm': ['Space Grotesk']
      },
      fontSize: {
        'label-lg': ['14px', { lineHeight: '18px', letterSpacing: '0.08em', fontWeight: '600' }],
        'body-md': ['15px', { lineHeight: '22px', letterSpacing: '0.01em', fontWeight: '400' }],
        'body-lg': ['18px', { lineHeight: '26px', letterSpacing: '0.01em', fontWeight: '400' }],
        'headline-lg': ['36px', { lineHeight: '38px', letterSpacing: '0.06em', fontWeight: '700' }],
        'headline-sm': ['20px', { lineHeight: '22px', letterSpacing: '0.04em', fontWeight: '600' }],
        'headline-md': ['24px', { lineHeight: '26px', letterSpacing: '0.05em', fontWeight: '600' }],
        'label-md': ['12px', { lineHeight: '16px', letterSpacing: '0.06em', fontWeight: '500' }],
        'label-sm': ['10px', { lineHeight: '12px', letterSpacing: '0.1em', fontWeight: '500' }],
        'body-sm': ['13px', { lineHeight: '18px', letterSpacing: '0.02em', fontWeight: '400' }]
      }
    }
  }
};
