'use client'

import Link from 'next/link'
import { BookOpen, Calendar, ChevronRight } from 'lucide-react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
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

          <div className='grid gap-6 md:grid-cols-2'>
            <Link
              href='/tutor/settings/availability'
              className='group block transition-transform hover:scale-[1.02]'
            >
              <Card className='h-full border-2 group-hover:border-primary transition-colors'>
                <CardHeader>
                  <div className='flex items-start justify-between'>
                    <div className='flex items-center gap-3'>
                      <div className='rounded-lg bg-primary/10 p-2.5'>
                        <Calendar className='h-5 w-5 text-primary' />
                      </div>
                      <div>
                        <CardTitle className='text-lg'>Disponibilità</CardTitle>
                      </div>
                    </div>
                    <ChevronRight className='h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors' />
                  </div>
                  <CardDescription className='mt-2'>
                    Aggiorna i giorni di disponibilità
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className='text-sm text-muted-foreground'>
                    Seleziona i giorni della settimana in cui sei disponibile
                    per tenere lezioni. Le lezioni si svolgono sempre dalle
                    15:00 alle 16:00.
                  </p>
                </CardContent>
              </Card>
            </Link>
            <Link
              href='/tutor/settings/'
              className='group block transition-transform hover:scale-[1.02]'
            >
              <Card className='h-full border-2 group-hover:border-primary transition-colors'>
                <CardHeader>
                  <div className='flex items-start justify-between'>
                    <div className='flex items-center gap-3'>
                      <div className='rounded-lg bg-primary/10 p-2.5'>
                        <BookOpen className='h-5 w-5 text-primary' />
                      </div>
                      <div>
                        <CardTitle className='text-lg'>
                          Storico lezioni
                        </CardTitle>
                      </div>
                    </div>
                    <ChevronRight className='h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors' />
                  </div>
                  <CardDescription className='mt-2'>
                    Visualizza il tuo storico lezioni
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className='text-sm text-muted-foreground'></p>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
