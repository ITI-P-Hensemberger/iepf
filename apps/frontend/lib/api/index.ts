// Types for backend responses, read from the generated OpenAPI schema in ./schema.ts.
import type { paths } from './schema'

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete'

type JsonBody<Response> = Response extends { content: { 'application/json': infer Body } } ? Body : never

/** JSON body the backend returns with a 200 for `method` on `path`, e.g. `ApiResponse<'/lessons'>`. */
export type ApiResponse<Path extends keyof paths, M extends Method = 'get'> =
  paths[Path][M] extends { responses: { 200: infer Response } } ? JsonBody<Response> : never

export type { paths }
