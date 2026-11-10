// Purpose: Lesson chat route schemas: one chat per booking, between its student and the lesson's tutor.
import { createRoute, z } from '@hono/zod-openapi'

import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { jsonContent, jsonContentRequired } from '@/lib/openapi/helpers'
import { createErrorMessageSchema, createErrorSchema } from '@/lib/openapi/schemas'

const tags = ['Lesson chat']
const security = [{ bearerAuth: [] as string[] }]

export const MESSAGE_MAX = 2_000

const ParamsSchema = z.object({
  lessonId: z.uuid().openapi({ param: { name: 'lessonId', in: 'path', required: true }, example: 'f9f2245c-5f2f-4a6f-83f8-817adf7a9d41' }),
  bookingId: z.uuid().openapi({ param: { name: 'bookingId', in: 'path', required: true }, example: '2f5a94b2-31ef-4a59-9df2-10f5b0b0f7b3' })
})

export const messageSchema = z.object({
  id: z.string(),
  // Who wrote it, for an admin who reads the chat; 'mine' is false for them.
  senderRole: z.enum(['student', 'tutor']),
  mine: z.boolean(),
  body: z.string(),
  createdAt: z.string(),
  readAt: z.string().nullable()
})

export const chatSchema = z.object({
  // False once the lesson has ended or the lesson or booking was canceled: readable, not writable.
  open: z.boolean(),
  messages: z.array(messageSchema)
})

export const messageInputSchema = z.object({
  body: z.string().trim().min(1, 'Scrivi un messaggio.').max(MESSAGE_MAX, `Al massimo ${MESSAGE_MAX} caratteri.`)
})

const unauthorized = jsonContent(createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED), 'Invalid credentials')
const forbidden = jsonContent(createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN), 'Not part of this booking')
const notFound = jsonContent(createErrorMessageSchema(HttpStatusPhrases.NOT_FOUND), 'Booking not found')

export const getChat = createRoute({
  path: '/lessons/{lessonId}/bookings/{bookingId}/messages',
  method: 'get',
  tags,
  security,
  request: { params: ParamsSchema },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(chatSchema, 'The chat, oldest message first'),
    [HttpStatusCodes.UNAUTHORIZED]: unauthorized,
    [HttpStatusCodes.FORBIDDEN]: forbidden,
    [HttpStatusCodes.NOT_FOUND]: notFound,
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(createErrorSchema(ParamsSchema), 'Validation error(s)')
  }
})

export const sendMessage = createRoute({
  path: '/lessons/{lessonId}/bookings/{bookingId}/messages',
  method: 'post',
  tags,
  security,
  request: { params: ParamsSchema, body: jsonContentRequired(messageInputSchema, 'The message') },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(messageSchema, 'Message sent'),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(createErrorMessageSchema('Il messaggio contiene parole non consentite.'), 'Inappropriate language'),
    [HttpStatusCodes.CONFLICT]: jsonContent(createErrorMessageSchema('La chat è chiusa.'), 'Lesson ended or canceled'),
    [HttpStatusCodes.UNAUTHORIZED]: unauthorized,
    [HttpStatusCodes.FORBIDDEN]: forbidden,
    [HttpStatusCodes.NOT_FOUND]: notFound,
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(createErrorSchema(messageInputSchema).or(createErrorSchema(ParamsSchema)), 'Validation error(s)')
  }
})

export const markChatRead = createRoute({
  path: '/lessons/{lessonId}/bookings/{bookingId}/messages/read',
  method: 'post',
  tags,
  security,
  request: { params: ParamsSchema },
  responses: {
    [HttpStatusCodes.NO_CONTENT]: { description: 'The other person\'s messages are read' },
    [HttpStatusCodes.UNAUTHORIZED]: unauthorized,
    [HttpStatusCodes.FORBIDDEN]: forbidden,
    [HttpStatusCodes.NOT_FOUND]: notFound,
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(createErrorSchema(ParamsSchema), 'Validation error(s)')
  }
})

export const CHATS_MAX = 100

export const listChats = createRoute({
  path: '/lesson-messages',
  method: 'get',
  tags,
  security,
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.array(z.object({
      lessonId: z.string(),
      bookingId: z.string(),
      subjectName: z.string(),
      startAt: z.string(),
      // The other person: the tutor for a student, the student for a tutor.
      otherName: z.string(),
      open: z.boolean(),
      unread: z.number().int(),
      lastMessageAt: z.string().nullable()
    })), 'The current user\'s chats: open ones and closed ones with messages, latest conversation first'),
    [HttpStatusCodes.UNAUTHORIZED]: unauthorized
  }
})

export type GetChatRoute = typeof getChat
export type SendMessageRoute = typeof sendMessage
export type MarkChatReadRoute = typeof markChatRead
export type ListChatsRoute = typeof listChats
