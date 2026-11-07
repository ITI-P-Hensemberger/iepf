import type { Metadata, Viewport } from 'next'
import { GuestTheme } from '@/components/guest-theme'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import Footer from '@/components/footer'
import { SettingsProvider } from '@/components/settings-provider'
import ImpersonationBanner from '@/components/impersonation-banner'
import { SessionRefresh } from '@/components/session-refresh'
import { fakeClockScript, fakeNow } from '@/lib/fake-clock'
import './fonts/roboto.css'
import './globals.css'

// The status bar and browser chrome follow the device theme, in the site's own colors
// (--background of the light and dark themes).
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3f3f2' },
    { media: '(prefers-color-scheme: dark)', color: '#1c1d21' }
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
  const simulatedNow = fakeNow()
  return (
    <html lang='it' suppressHydrationWarning>
      {simulatedNow && (
        <head>
          <script dangerouslySetInnerHTML={{ __html: fakeClockScript(simulatedNow) }} />
        </head>
      )}
      <body className='min-h-dvh flex flex-col'>
        {simulatedNow && (
          <div className='pointer-events-none fixed right-2 bottom-2 z-50 rounded-md bg-amber-500 px-2 py-1 text-xs font-medium text-black'>
            Orologio simulato: {new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }).format(new Date(simulatedNow))}
          </div>
        )}
        <ThemeProvider
          attribute='class'
          defaultTheme='system'
          enableSystem
          disableTransitionOnChange
        >
          <GuestTheme />
          <SettingsProvider>
            <SessionRefresh />
            <div className='flex min-h-dvh flex-col'>
              <ImpersonationBanner />
              <div className='flex flex-1 flex-col'>{children}</div>
              <Footer />
              <Toaster />
            </div>
          </SettingsProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
