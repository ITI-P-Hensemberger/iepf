import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from './ui/button'
import Link from 'next/link'

function HomepageTabs() {
  return (
    <Tabs
      className='w-full max-w-2xl mt-10 px-4 text-justify'
      defaultValue='cose-insieme-e-facile'
    >
      <TabsList className='self-center'>
        <TabsTrigger value='cose-insieme-e-facile'>Cos&apos;è IEPF</TabsTrigger>
        <Button asChild variant='ghost'>
          <Link href='/faq'>FAQ</Link>
        </Button>
      </TabsList>

      <TabsContent value='cose-insieme-e-facile'>
        <Card className='mt-4 sm:max-h-[40vh] max-h-[30vh] overflow-y-auto px-4'>
          <p>
            <b>InsiemeÈ+Facile</b> è la piattaforma di supporto allo studio
            dell&apos;<b>ITI P. Hensemberger</b> di Monza, pensata per aiutare gli
            studenti a consolidare i concetti fondamentali e affrontare con più
            sicurezza le materie nelle quali sono in difficoltà.
          </p>
          <p>
            Qui non trovi “compiti svolti al posto tuo”, ma un percorso guidato
            per capire il metodo, chiarire i dubbi e imparare a svolgere gli
            esercizi in autonomia, passo dopo passo.
          </p>
          <p>
            Le attività sono seguite dai nostri tutor: studenti di terza,
            quarta e quinta selezionati per competenza e capacità di spiegare in modo
            chiaro e pratico.
          </p>
        </Card>
      </TabsContent>
    </Tabs>
  )
}

export default HomepageTabs
