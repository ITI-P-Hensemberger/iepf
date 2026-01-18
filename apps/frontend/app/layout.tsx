import type { Metadata } from 'next'
import { Roboto } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'
import Footer from '@/components/footer'
import Header from '@/components/header'

const roboto = Roboto({
  weight: '400',
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
      <body className='min-h-full flex flex-col'>
        <ThemeProvider
          attribute='class'
          defaultTheme='system'
          enableSystem
          disableTransitionOnChange
        >
          <div className='flex min-h-full flex-col'>
            <div className='flex-1'>{children}</div>
            <Footer />
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
