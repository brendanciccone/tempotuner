# TempoTuner

A modern web application built with Next.js, React, and TypeScript for music tempo tuning and analysis.

## 🚀 Features

- Modern, responsive UI built with TailwindCSS and Shadcn/UI components
- Metronome functionality with tap tempo detection
- Interactive visualizations using Recharts
- Dark/Light mode support with next-themes
- Fully accessible components using Radix UI
- Form handling with React Hook Form and Zod validation
- Toast notifications with Sonner
- Analytics integration with Vercel Analytics

## 🛠️ Tech Stack

- **Framework:** Next.js 15
- **Language:** TypeScript
- **Styling:** TailwindCSS
- **UI Components:** Shadcn/UI (Radix UI)
- **Form Handling:** React Hook Form + Zod
- **State Management:** React Hooks
- **Package Manager:** PNPM
- **Analytics:** Vercel Analytics
- **Date Handling:** date-fns
- **Icons:** Lucide React

## 📦 Prerequisites

- Node.js 18+ 
- PNPM 8+

## 🚀 Getting Started

1. Clone the repository:
```bash
git clone https://github.com/yourusername/tempotuner.git
cd tempotuner
```

2. Install dependencies:
```bash
pnpm install
```

3. Start the development server:
```bash
pnpm dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

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
│   ├── tuner/       # Tempo tuning components
│   ├── ui/          # Shadcn UI components
│   └── features/    # Feature-specific components
├── lib/             # Utility functions and shared logic
├── hooks/           # Custom React hooks
├── utils/           # Helper functions
├── public/          # Static assets
└── styles/          # Global styles
```

## 🔧 Configuration

The project uses several configuration files:

- `next.config.mjs` - Next.js configuration
- `tailwind.config.ts` - TailwindCSS configuration
- `tsconfig.json` - TypeScript configuration
- `postcss.config.mjs` - PostCSS configuration
- `components.json` - Shadcn/UI configuration

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- [Next.js](https://nextjs.org/)
- [TailwindCSS](https://tailwindcss.com/)
- [Shadcn/UI](https://ui.shadcn.com/)
- [Radix UI](https://www.radix-ui.com/) 