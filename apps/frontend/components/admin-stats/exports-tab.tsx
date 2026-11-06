'use client'

import { BarChart3, Bell, BookOpen, CalendarDays, Download, GraduationCap, Layers, ListChecks, MessageSquare, ShieldAlert, Users } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { downloadYearReport } from '@/lib/year-report'

export const REPORT_SHEETS = [
  { name: 'Riepilogo', icon: BarChart3, description: 'I numeri chiave dell\'anno con due grafici.' },
  { name: 'Andamento', icon: CalendarDays, description: 'Lezioni, prenotazioni, presenze e feedback mese per mese.' },
  { name: 'Classi', icon: Layers, description: 'Iscritti, prenotazioni e presenze per anno e sezione.' },
  { name: 'Studenti', icon: GraduationCap, description: 'Una riga per studente: prenotazioni, presenze, ore, voti.' },
  { name: 'Tutor', icon: Users, description: 'Una riga per tutor: materie, lezioni, ore svolte, voti ricevuti.' },
  { name: 'Lezioni e prenotazioni', icon: ListChecks, description: 'L\'elenco completo, con argomento, stato e presenza.' },
  { name: 'Feedback', icon: MessageSquare, description: 'Ogni voto con il suo commento, nei due sensi.' },
  { name: 'Materie', icon: BookOpen, description: 'Tutor, lezioni e richieste per materia.' },
  { name: 'Utilizzo', icon: BarChart3, description: 'Statistiche d\'uso anonime: attivi, esiti, pagine, errori.' },
  { name: 'Notifiche', icon: Bell, description: 'Copertura push, aperture, pannello, dispositivi.' }
] as const

export function useYearReportDownload() {
  const [busy, setBusy] = React.useState(false)
  const [saved, setSaved] = React.useState<string | null>(null)
  const download = React.useCallback(async () => {
    setBusy(true)
    try {
      const filename = await downloadYearReport()
      setSaved(filename)
      return true
    }
    catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossibile generare il report.')
      return false
    }
    finally {
      setBusy(false)
    }
  }, [])
  return { busy, saved, download }
}

export function ExportsTab() {
  const { busy, saved, download } = useYearReportDownload()

  return (
    <div className='space-y-6'>
      <Card>
        <CardHeader>
          <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
            <div className='space-y-1.5'>
              <CardTitle>Report dell&apos;anno scolastico</CardTitle>
              <CardDescription>
                Un file Excel con tutti i dati dell&apos;anno, diviso in fogli, con grafici e tabelle filtrabili.
                Si apre con Excel, Numbers, LibreOffice o Google Fogli.
              </CardDescription>
            </div>
            <Button onClick={() => void download()} disabled={busy} className='shrink-0'>
              <Download className='size-4' aria-hidden />
              {busy ? 'Preparazione...' : 'Scarica il report (.xlsx)'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className='space-y-6'>
          {saved && <p className='text-sm text-muted-foreground' role='status'>Salvato come <span className='font-medium text-foreground'>{saved}</span>.</p>}
          <ul className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
            {REPORT_SHEETS.map(sheet => (
              <li key={sheet.name} className='flex gap-3 rounded-lg border p-3'>
                <sheet.icon className='mt-0.5 size-4 shrink-0 text-muted-foreground' aria-hidden />
                <div className='space-y-0.5'>
                  <p className='text-sm font-medium'>{sheet.name}</p>
                  <p className='text-sm text-muted-foreground'>{sheet.description}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className='flex gap-3 rounded-lg bg-muted/50 p-3 text-sm'>
            <ShieldAlert className='mt-0.5 size-4 shrink-0 text-muted-foreground' aria-hidden />
            <p className='text-muted-foreground'>
              Il file contiene nomi, email, argomenti e commenti di studenti, molti minorenni. Conservalo solo negli
              archivi della scuola e non inoltrarlo fuori dal personale autorizzato.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
