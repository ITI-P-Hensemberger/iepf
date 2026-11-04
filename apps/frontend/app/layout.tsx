import type { Metadata } from 'next'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import Footer from '@/components/footer'
import { SettingsProvider } from '@/components/settings-provider'
import ImpersonationBanner from '@/components/impersonation-banner'
import './fonts/roboto.css'
import './globals.css'

export const metadata: Metadata = {
  title: 'IEPF - InsiemeÈ+Facile'
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
