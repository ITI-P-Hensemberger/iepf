declare module 'next-pwa' {
  import type { NextConfig } from 'next'

  type WithPwaOptions = {
    dest?: string
    register?: boolean
    skipWaiting?: boolean
    disable?: boolean
    fallbacks?: {
      document?: string
      image?: string
      audio?: string
      video?: string
      font?: string
      data?: string
    }
  }

  const withPWA: (options?: WithPwaOptions) => (config: NextConfig) => NextConfig
  export default withPWA
}
