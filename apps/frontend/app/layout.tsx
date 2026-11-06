import type { Metadata, Viewport } from 'next'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import Footer from '@/components/footer'
import { SettingsProvider } from '@/components/settings-provider'
import ImpersonationBanner from '@/components/impersonation-banner'
import { SessionRefresh } from '@/components/session-refresh'
import './fonts/roboto.css'
import './globals.css'

// The status bar and browser chrome follow the device theme, in the site's own colors
// (--background of the light and dark themes).
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' }
  ]
}

export const metadata: Metadata = {
  title: 'IEPF - InsiemeÈ+Facile',
  // Added to the Home Screen, the site opens as an app: on iPhone that is what enables push.
  appleWebApp: { capable: true, title: 'IEPF', statusBarStyle: 'default' }
}

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang='it' suppressHydrationWarning>
      <body className='min-h-dvh flex flex-col'>
        <ThemeProvider
          attribute='class'
          defaultTheme='system'
          enableSystem
          disableTransitionOnChange
        >
          <SettingsProvider>
            <SessionRefresh />
            <div className='flex min-h-dvh flex-col'>
              <ImpersonationBanner />
              <div className='flex-1'>{children}</div>
              <Footer />
              <Toaster />
            </div>
          </SettingsProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
