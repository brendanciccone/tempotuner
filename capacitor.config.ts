import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.tempotuner',
  appName: 'TempoTuner',
  webDir: 'out',
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#1f1f1f',
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
    },
    ScreenOrientation: {
      lockOrientation: 'portrait',
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#1f1f1f',
      overlaysWebView: true,
    },
  },
  server: {
    androidScheme: 'https',
  },
  ios: {
    contentInset: 'automatic',
  },
  android: {
    backgroundColor: '#1f1f1f',
  },
};

export default config;
