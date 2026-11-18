import type { Metadata } from 'next';
import { Cinzel, Montserrat, Playfair_Display, Poppins } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/context/ThemeContext';
import { PortalMotionConfig } from '@/components/MotionPrimitives';

const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-cinzel',
  display: 'swap',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-playfair',
  display: 'swap',
});

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-montserrat',
  display: 'swap',
});

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
    <html
      lang="en"
      suppressHydrationWarning
      className={`${cinzel.variable} ${playfair.variable} ${poppins.variable} ${montserrat.variable}`}
    >
      <body
        suppressHydrationWarning
        className="bg-[#F8FAF7] dark:bg-[#071713] text-[#17221F] dark:text-[#F0F5F2] font-sans antialiased selection:bg-[#D4AF37]/25 selection:text-[#064E3B] dark:selection:text-[#D4AF37]"
      >
        <ThemeProvider>
          <PortalMotionConfig>{children}</PortalMotionConfig>
        </ThemeProvider>
      </body>
    </html>
  );
}
