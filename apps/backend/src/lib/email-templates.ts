// Purpose: Centralized email subjects and text bodies.
import fs from 'node:fs'
import path from 'node:path'

import env from '@/env'

function buildVerificationLink(token: string) {
  const baseUrl = env.SITE_URL ?? 'http://localhost:3000'
  const url = new URL('/auth/verify-email', baseUrl)
  url.searchParams.set('token', token)
  return url.toString()
}

function buildPasswordResetLink(token: string) {
  const baseUrl = env.SITE_URL ?? 'http://localhost:3000'
  const url = new URL('/auth/reset-password', baseUrl)
  url.searchParams.set('token', token)
  return url.toString()
}

interface EmailTemplate {
  subject: string
  text: string
  html: string
}

const LOGO_FILENAME = 'logo.png'
let cachedLogoDataUri: string | null = null

function loadLogoDataUri() {
  if (cachedLogoDataUri !== null) {
    return cachedLogoDataUri
  }

  try {
    const logoPath = path.resolve(process.cwd(), 'assets', LOGO_FILENAME)
    const file = fs.readFileSync(logoPath)
    cachedLogoDataUri = `data:image/png;base64,${file.toString('base64')}`
  }
  catch {
    cachedLogoDataUri = ''
  }

  return cachedLogoDataUri
}

function buildEmailHtml(title: string, message: string, action?: { label: string, url: string }) {
  const actionHtml = action
    ? `<a href="${action.url}" style="display:inline-block;margin-top:24px;padding:12px 20px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">${action.label}</a>`
    : ''
  const logoDataUri = loadLogoDataUri()
  const logoHtml = logoDataUri
    ? `<img src="${logoDataUri}" alt="Logo" style="display:block;width:96px;height:96px;margin:0 auto 12px;object-fit:contain;" />`
    : `<div style="width:96px;height:96px;margin:0 auto 12px;border-radius:16px;background:#e2e8f0;display:flex;align-items:center;justify-content:center;font-weight:700;color:#334155;letter-spacing:1px;">LOGO</div>`

  return `
  <div style="margin:0;padding:24px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;text-align:center;box-shadow:0 10px 30px rgba(15,23,42,0.08);">
      ${logoHtml}
      <div style="margin:0 0 16px;font-size:14px;letter-spacing:2px;text-transform:uppercase;color:#64748b;font-weight:700;">IEPF</div>
      <h1 style="margin:0 0 12px;font-size:22px;color:#0f172a;">${title}</h1>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#475569;">${message}</p>
      ${actionHtml}
    </div>
    <p style="margin:20px 0 0;text-align:center;font-size:12px;color:#94a3b8;">Se non hai richiesto questa email, puoi ignorarla.</p>
  </div>
  `.trim()
}

export function buildStudentRegistrationMessage(token: string) {
  const link = buildVerificationLink(token)
  return {
    subject: 'Verifica la tua email',
    text: `Benvenuto! Verifica la tua email visitando: ${link}`,
    html: buildEmailHtml(
      'Verifica la tua email',
      'Benvenuto! Verifica la tua email per completare la registrazione.',
      { label: 'Verifica email', url: link }
    )
  } satisfies EmailTemplate
}

export function buildEmailVerificationMessage(token: string) {
  const link = buildVerificationLink(token)
  return {
    subject: 'Verifica la tua email',
    text: `Verifica la tua email visitando: ${link}`,
    html: buildEmailHtml(
      'Verifica la tua email',
      'Per continuare, verifica la tua email.',
      { label: 'Verifica email', url: link }
    )
  } satisfies EmailTemplate
}

export function buildPasswordResetMessage(token: string) {
  const link = buildPasswordResetLink(token)
  return {
    subject: 'Reimposta la tua password',
    text: `Reimposta la tua password visitando: ${link}`,
    html: buildEmailHtml(
      'Reimposta la tua password',
      'Clicca sul pulsante per reimpostare la tua password.',
      { label: 'Reimposta password', url: link }
    )
  } satisfies EmailTemplate
}

export function buildTutorCreatedMessage(token: string) {
  const link = buildVerificationLink(token)
  return {
    subject: 'Il tuo account tutor è pronto',
    text: `Un amministratore ha creato il tuo account tutor. Verifica la tua email visitando: ${link}`,
    html: buildEmailHtml(
      'Account tutor creato',
      'Un amministratore ha creato il tuo account tutor. Verifica la tua email per continuare.',
      { label: 'Verifica email', url: link }
    )
  } satisfies EmailTemplate
}

export function buildProfileUpdatedMessage() {
  return {
    subject: 'Il tuo profilo è stato aggiornato',
    text: 'I dettagli del tuo profilo sono stati aggiornati.',
    html: buildEmailHtml(
      'Profilo aggiornato',
      'I dettagli del tuo profilo sono stati aggiornati.'
    )
  } satisfies EmailTemplate
}

export function buildActivationChangedMessage(isActive: boolean) {
  const message = isActive
    ? 'Il tuo account è stato attivato. Ora puoi accedere alle lezioni.'
    : 'Il tuo account è stato disattivato. Contatta il supporto se non ti aspettavi questa modifica.'

  return {
    subject: isActive ? 'Il tuo account è ora attivo' : 'Il tuo account è stato disattivato',
    text: message,
    html: buildEmailHtml(
      isActive ? 'Account attivo' : 'Account disattivato',
      message
    )
  } satisfies EmailTemplate
}

export function buildRegistrationConfirmedMessage() {
  return {
    subject: 'Registrazione completata',
    text: 'La tua email è stata verificata. Ora puoi accedere.',
    html: buildEmailHtml(
      'Registrazione completata',
      'La tua email è stata verificata. Ora puoi accedere.'
    )
  } satisfies EmailTemplate
}
