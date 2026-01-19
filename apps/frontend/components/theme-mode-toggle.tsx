'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

import { Button } from '@/components/ui/button'

export function ModeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <div className='flex items-center justify-center gap-4'>
      <Button
        variant='outline'
        size='icon'
        className={theme === 'light' ? 'ring-2 ring-primary' : undefined}
        onClick={() => setTheme('light')}
        disabled={theme === 'light'}
      >
        <Sun className='h-[1.2rem] w-[1.2rem]' />
      </Button>
      <Button
        variant='outline'
        size='icon'
        className={theme === 'dark' ? 'ring-2 ring-primary' : undefined}
        onClick={() => setTheme('dark')}
        disabled={theme === 'dark'}
      >
        <Moon className='h-[1.2rem] w-[1.2rem]' />
      </Button>
      <Button
        variant='outline'
        size='icon'
        className={theme === 'system' ? 'ring-2 ring-primary' : undefined}
        onClick={() => setTheme('system')}
        disabled={theme === 'system'}
      >
        <Monitor className='h-[1.2rem] w-[1.2rem]' />
      </Button>
    </div>
  )
}
