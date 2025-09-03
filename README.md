# TempoTuner

A tuner and metronome web application using the Web Audio API, built with Next.js.

## 🚀 Features

- **Chromatic Tuner**: Accurately detects instrument pitch in real-time
- **Tap Tempo**: Calculate BPM by tapping the screen
- **Multiple Visual Styles**: Choose from different UI themes
- **Fully Responsive**: Works on mobile and desktop devices
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
- **Package Manager:** PNPM
- **Analytics:** Vercel Analytics
- **Icons:** Lucide React

## 📦 Prerequisites

- Node.js 18+
- PNPM 8+

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

<!-- Mobile build instructions removed. Project is now web-only. -->

## 📝 Available Scripts

- `pnpm dev` - Start the development server with Turbo mode
- `pnpm build` - Build the application for production
- `pnpm start` - Start the production server
- `pnpm lint` - Run ESLint for code linting

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
├── utils/            # Helper functions (e.g., audio processing)
├── public/           # Static assets
└── styles/           # Global styles
```

## 📱 Deployment

### Web Deployment

Deploy the `out` directory to your favorite static hosting service.

<!-- Mobile deployment instructions removed. Web-only deployment supported. -->

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

## License

[MIT](LICENSE) 