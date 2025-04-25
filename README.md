# TempoTuner

A tuner and metronome web application using the Web Audio API, built with Next.js and Capacitor for cross-platform distribution.

## 🚀 Features

- **Chromatic Tuner**: Accurately detects instrument pitch in real-time
- **Tap Tempo**: Calculate BPM by tapping the screen
- **Multiple Visual Styles**: Choose from different UI themes
- **Fully Responsive**: Works on mobile and desktop devices
- **Native App Capabilities**: When built with Capacitor
- Modern, responsive UI built with TailwindCSS and Shadcn/UI components
- Dark/Light mode support with next-themes
- Fully accessible components using Radix UI

## 🛠️ Tech Stack

- **Framework:** Next.js 15
- **Language:** TypeScript
- **Styling:** TailwindCSS
- **UI Components:** Shadcn/UI (Radix UI)
- **Form Handling:** React Hook Form + Zod
- **Audio Processing:** Web Audio API
- **Cross-Platform:** Capacitor
- **Package Manager:** PNPM
- **Analytics:** Vercel Analytics
- **Icons:** Lucide React

## 📦 Prerequisites

- Node.js 18+
- PNPM 8+
- For iOS: Xcode, CocoaPods
- For Android: Android Studio, Java Development Kit

## 🚀 Getting Started

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/tempotuner.git
cd tempotuner

# Install dependencies
pnpm install
```

### Web Development

```bash
# Run local development server
pnpm dev

# Build for production
pnpm build
```

### Mobile Development with Capacitor

This project uses Capacitor to build iOS and Android apps from the web codebase.

```bash
# Build the web app and sync with Capacitor
pnpm build:mobile

# Add iOS platform (only needed once)
pnpm cap:ios

# Add Android platform (only needed once)
pnpm cap:android

# Sync latest web code with native projects
pnpm cap:sync

# Open the project in Xcode
pnpm cap:open:ios

# Open the project in Android Studio
pnpm cap:open:android

# Quick commands to build and open in IDE
pnpm ios
pnpm android
```

## 📝 Available Scripts

- `pnpm dev` - Start the development server with Turbo mode
- `pnpm build` - Build the application for production
- `pnpm start` - Start the production server
- `pnpm lint` - Run ESLint for code linting
- `pnpm build:mobile` - Build for mobile and sync with Capacitor
- `pnpm ios` - Build and open iOS project in Xcode
- `pnpm android` - Build and open Android project in Android Studio

## 🏗️ Project Structure

```
tempotuner/
├── app/              # Next.js app directory
│   ├── layout.tsx    # Root layout with theme provider
│   ├── page.tsx      # Main page component
│   └── globals.css   # Global styles
├── components/       # React components
│   ├── tuner/        # Tuner components
│   ├── ui/           # Shadcn UI components
├── hooks/            # Custom React hooks
├── utils/            # Helper functions
│   └── audio-analyzer.ts # Audio processing logic
├── ios/              # iOS native project
├── android/          # Android native project 
├── public/           # Static assets
└── styles/           # Global styles
```

## 📱 Deployment

### Web Deployment

Deploy the `out` directory to your favorite static hosting service.

### iOS App Store Deployment

1. Build the project using `pnpm ios`
2. In Xcode, select a development team
3. Update the app bundle identifier if needed
4. Create app icons and splash screens
5. Configure app settings in App Store Connect
6. Archive and upload to App Store Connect

### Android Play Store Deployment

1. Build the project using `pnpm android`
2. In Android Studio, update the app details in `android/app/build.gradle`
3. Create app icons and splash screens
4. Generate a signed APK or App Bundle
5. Upload to Google Play Console

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 🙏 Acknowledgments

- [Next.js](https://nextjs.org/)
- [TailwindCSS](https://tailwindcss.com/)
- [Shadcn/UI](https://ui.shadcn.com/)
- [Radix UI](https://www.radix-ui.com/)
- [Capacitor](https://capacitorjs.com/)

## License

[MIT](LICENSE) 