// Purpose: Restrict destructive development helpers to managed loopback databases.
export function assertLocalDatabase(databaseUrl: string, nodeEnv: string) {
  const url = new URL(databaseUrl)
  if (!['development', 'test'].includes(nodeEnv)
    || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    || !['/iepf_dev', '/iepf_test'].includes(url.pathname)) {
    throw new Error('Dev seed requires a loopback database named iepf_dev or iepf_test in development/test mode')
  }
}
