import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/context/ThemeContext';
import { FloatingThemeFab } from '@/components/ThemeToggle';
import { PortalMotionConfig } from '@/components/MotionPrimitives';

export const metadata: Metadata = {
  title: 'Al-Nibras Class Union Portal',
  description:
    'Connecting Students, Building Community, Creating Opportunities. Official Class Union Management Portal for Al-Nibras.',
  openGraph: {
    title: 'Al-Nibras Class Union Portal',
    description:
      'Connecting Students, Building Community, Creating Opportunities. Official Class Union Management Portal for Al-Nibras.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Al-Nibras Class Union Portal',
    description:
      'Connecting Students, Building Community, Creating Opportunities. Official Class Union Management Portal for Al-Nibras.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className="bg-[#F8FAF7] dark:bg-[#071713] text-[#17221F] dark:text-[#F0F5F2] font-sans antialiased selection:bg-[#D4AF37]/25 selection:text-[#064E3B] dark:selection:text-[#D4AF37]"
      >
        <ThemeProvider>
          <PortalMotionConfig>
            {children}
            <FloatingThemeFab />
          </PortalMotionConfig>
        </ThemeProvider>
      </body>
    </html>
  );
}
