import type { Metadata } from 'next'
import { Roboto } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import Footer from '@/components/footer'
import { SettingsProvider } from '@/components/settings-provider'
import './globals.css'

const roboto = Roboto({
  weight: ['400', '600', '700'],
  subsets: ['latin']
})

export const metadata: Metadata = {
  title: 'IEPF - InsiemeÈ+Facile'
}

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang='it' className={roboto.className} suppressHydrationWarning>
      <body className='min-h-dvh flex flex-col'>
        <ThemeProvider
          attribute='class'
          defaultTheme='system'
          enableSystem
          disableTransitionOnChange
        >
          <SettingsProvider>
            <div className='flex min-h-dvh flex-col'>
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
