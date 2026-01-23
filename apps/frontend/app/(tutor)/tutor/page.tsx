'use client'

import Link from 'next/link'
import { BookOpen, Calendar, ChevronRight } from 'lucide-react'

import {
  Card,
  CardContent,
  CardTitle
} from '@/components/ui/card'
import { useSession } from '@/lib/use-session'

export default function TutorPage() {
  const { profile, isLoading: isProfileLoading } = useSession()

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10'>
        <div className='max-w-4xl mx-auto'>
          <h1 className='text-2xl font-bold mb-2'>
            {!isProfileLoading && `Bentornato, ${profile?.firstName}`}
          </h1>
          <p className='text-muted-foreground mb-8'>
            Gestisci le tue lezioni da questa pagina.
          </p>

          <div className='grid gap-4 sm:gap-6 md:grid-cols-2'>
            <Link href='/tutor/settings/availability' className='group block'>
              <Card className='border py-4 sm:py-6'>
                <CardContent>
                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-3'>
                      <div className='rounded-lg bg-primary/10 p-2.5'>
                        <Calendar className='h-4 w-4 text-primary' />
                      </div>
                      <div>
                        <CardTitle className='text-md'>Disponibilità</CardTitle>
                      </div>
                    </div>
                    <ChevronRight className='h-5 w-5 text-muted-foreground' />
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href='/tutor/settings/' className='group block'>
              <Card className='border py-4 sm:py-6'>
                <CardContent>
                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-3'>
                      <div className='rounded-lg bg-primary/10 p-2.5'>
                        <BookOpen className='h-4 w-4 text-primary' />
                      </div>
                      <div>
                        <CardTitle className='text-md'>
                          Storico lezioni
                        </CardTitle>
                      </div>
                    </div>
                    <ChevronRight className='h-5 w-5 text-muted-foreground' />
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
