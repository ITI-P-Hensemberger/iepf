// Purpose: Print a new VAPID key pair for backend.env. Generate it once per environment:
// replacing the keys silently invalidates every device already subscribed.
import webpush from 'web-push'

const keys = webpush.generateVAPIDKeys()
process.stdout.write(`VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\n`)
