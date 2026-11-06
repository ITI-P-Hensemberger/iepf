// A student's package of lesson hours: when it runs out, nothing can be booked until the school
// sells a new one, so every page that shows the hours says so and points to the contact address.
export const CONTACT_EMAIL = 'iepf@hensemberger.it'

export const NEW_PACKAGE_MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Nuovo pacchetto di ore di lezione')}`

export function hasNoHoursLeft(tokens: number | null | undefined) {
  return tokens === 0
}
