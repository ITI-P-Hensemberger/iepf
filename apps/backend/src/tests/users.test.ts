import { testClient } from "hono/testing";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import * as HttpStatusCodes from "stoker/http-status-codes";
import * as HttpStatusPhrases from "stoker/http-status-phrases";
import { afterAll, beforeAll, beforeEach, describe, expect, expectTypeOf, it } from "vitest";
import { ZodIssueCode } from "zod";

import db from "@/db";
import { users } from "@/db/schemas/users.schema";
import env from "@/env";
import { ZOD_ERROR_CODES, ZOD_ERROR_MESSAGES } from "@/lib/constants";
import { createTestApp } from "@/lib/create-app";

import router from "@/routes/users/users.index";

if (env.NODE_ENV !== "test") {
  throw new Error("NODE_ENV must be 'test'");
}

const client = testClient(createTestApp(router));

type UserResponse = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  createdAt: string;
  updatedAt: string;
};

type ErrorResponse = {
  success: boolean;
  error: {
    name: string;
    issues: Array<{
      code: string;
      path: Array<string | number>;
      message?: string;
      params?: Record<string, unknown>;
    }>;
  };
};

type CreateUserPayload = {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
};

const baseUser: Omit<CreateUserPayload, "email"> = {
  firstName: "Jordan",
  lastName: "Developer",
  password: "Sup3rSecret!",
};

let emailCounter = 0;

function buildUserPayload(overrides: Partial<CreateUserPayload> = {}): CreateUserPayload {
  emailCounter += 1;
  return {
    email: overrides.email ?? `user${emailCounter}@example.com`,
    firstName: overrides.firstName ?? `${baseUser.firstName}${emailCounter}`,
    lastName: overrides.lastName ?? baseUser.lastName,
    password: overrides.password ?? baseUser.password,
  };
}

async function createUserFixture(overrides: Partial<CreateUserPayload> = {}) {
  const payload = buildUserPayload(overrides);
  const response = await client.users.$post({ json: payload });
  expect(response.status).toBe(HttpStatusCodes.CREATED);
  const body = (await response.json()) as UserResponse;

  return {
    payload,
    user: body,
  };
}

describe("users routes", () => {
  beforeAll(async () => {
    execSync("pnpm drizzle-kit push");
  });

  beforeEach(async () => {
    emailCounter = 0;
    await db.delete(users);
  });

  afterAll(async () => {
    fs.rmSync("test.db", { force: true });
  });

  it("returns an empty list when no users exist", async () => {
    const response = await client.users.$get();
    expect(response.status).toBe(HttpStatusCodes.OK);
    const body = (await response.json()) as UserResponse[];
    expect(body).toEqual([]);
  });

  it("creates a user and returns sanitized payload with Location header", async () => {
    const payload = buildUserPayload();
    const response = await client.users.$post({ json: payload });
    expect(response.status).toBe(HttpStatusCodes.CREATED);
    const body = (await response.json()) as UserResponse;

    expect(response.headers.get("Location")).toBe(`/users/${body.id}`);
    expect(body).toMatchObject({
      email: payload.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
      role: "student",
    });
    expectTypeOf(body.id).toBeString();
    expect(new Date(body.createdAt).toString()).not.toBe("Invalid Date");
    expect(new Date(body.updatedAt).toString()).not.toBe("Invalid Date");
    expect(body).not.toHaveProperty("password");
  });

  it("lists existing users without exposing password data", async () => {
    const userA = await createUserFixture();
    const userB = await createUserFixture();

    const response = await client.users.$get();
    expect(response.status).toBe(HttpStatusCodes.OK);
    const body = (await response.json()) as UserResponse[];

    expect(body).toHaveLength(2);
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: userA.user.id, email: userA.user.email, role: "student" }),
        expect.objectContaining({ id: userB.user.id, email: userB.user.email, role: "student" }),
      ]),
    );
    expect(body.every((user) => !("password" in user))).toBe(true);
  });

  it("rejects duplicate emails on create", async () => {
    const { payload } = await createUserFixture();

    const response = await client.users.$post({
      json: buildUserPayload({ email: payload.email }),
    });

    expect(response.status).toBe(HttpStatusCodes.CONFLICT);
    const body = (await response.json()) as ErrorResponse;
    const issue = body.error.issues[0];

    expect(body.success).toBe(false);
    expect(issue).toMatchObject({
      code: ZOD_ERROR_CODES.DUPLICATE_KEY,
      path: ["email"],
      message: ZOD_ERROR_MESSAGES.EMAIL_ALREADY_EXISTS,
    });
  });

  it("retrieves a single user by id", async () => {
    const { user } = await createUserFixture();
    const response = await client.users[":id"].$get({
      param: { id: user.id },
    });

    expect(response.status).toBe(HttpStatusCodes.OK);
    const body = (await response.json()) as UserResponse;
    expect(body).toEqual(user);
  });

  it("returns 404 when user does not exist", async () => {
    const response = await client.users[":id"].$get({
      param: { id: randomUUID() },
    });

    expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
    const body = (await response.json()) as { message: string };
    expect(body).toEqual({ message: HttpStatusPhrases.NOT_FOUND });
  });

  it("validates UUID params for user lookups", async () => {
    const response = await client.users[":id"].$get({
      param: { id: "not-a-uuid" },
    });

    expect(response.status).toBe(HttpStatusCodes.UNPROCESSABLE_ENTITY);
    const body = (await response.json()) as ErrorResponse;
    const issue = body.error.issues[0];

    expect(issue.code).toBe('invalid_format');
    expect(issue.path).toEqual(["id"]);
    expect(issue.message).toMatch(/uuid/i);
  });

  it("updates mutable fields without returning sensitive data", async () => {
    const { user } = await createUserFixture();
    const response = await client.users[":id"].$patch({
      param: { id: user.id },
      json: {
        firstName: "Updated",
        password: "AnotherSup3rSecret!",
      },
    });

    expect(response.status).toBe(HttpStatusCodes.OK);
    const body = (await response.json()) as UserResponse;

    expect(body).toMatchObject({
      id: user.id,
      firstName: "Updated",
      lastName: user.lastName,
      email: user.email,
    });
    
    expect(body.updatedAt).toEqual(expect.any(String));

    expect(new Date(body.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(user.updatedAt).getTime()
    );

    expect(body).not.toHaveProperty("password");
  });

  it("hashes passwords on patch updates", async () => {
    const { user } = await createUserFixture({ password: "PlainSecret1!" });

    const existing = await db.query.users.findFirst({
      where(fields, operators) {
        return operators.eq(fields.id, user.id);
      },
      columns: { passwordHash: true },
    });
    expect(existing?.passwordHash).toBeDefined();

    const response = await client.users[":id"].$patch({
      param: { id: user.id },
      json: { password: "PlainSecret2!" },
    });
    expect(response.status).toBe(HttpStatusCodes.OK);

    const updated = await db.query.users.findFirst({
      where(fields, operators) {
        return operators.eq(fields.id, user.id);
      },
      columns: { passwordHash: true },
    });

    expect(updated?.passwordHash).toBeDefined();
    expect(updated?.passwordHash).not.toBe(existing?.passwordHash);
    expect(updated?.passwordHash).not.toBe("PlainSecret2!");
  });

  it("rejects duplicate emails when patching existing users", async () => {
    const { user: firstUser } = await createUserFixture({ email: "primary@example.com" });
    const { user: secondUser } = await createUserFixture({ email: "secondary@example.com" });

    const response = await client.users[":id"].$patch({
      param: { id: secondUser.id },
      json: { email: firstUser.email },
    });

    expect(response.status).toBe(HttpStatusCodes.CONFLICT);
    const body = (await response.json()) as ErrorResponse;
    const issue = body.error.issues[0];

    expect(issue).toMatchObject({
      code: ZOD_ERROR_CODES.DUPLICATE_KEY,
      path: ["email"],
      message: ZOD_ERROR_MESSAGES.EMAIL_ALREADY_EXISTS,
    });
  });

  it("requires at least one field when patching", async () => {
    const { user } = await createUserFixture();
    const response = await client.users[":id"].$patch({
      param: { id: user.id },
      json: {},
    });

    expect(response.status).toBe(HttpStatusCodes.UNPROCESSABLE_ENTITY);
    const body = (await response.json()) as ErrorResponse;
    const issue = body.error.issues[0];

    expect(issue.code).toBe('custom');
    expect(issue.message).toBe(ZOD_ERROR_MESSAGES.NO_UPDATES);
    expect(issue.params?.code).toBe(ZOD_ERROR_CODES.INVALID_UPDATES);
  });

  it("returns 404 when patching a missing user", async () => {
    const response = await client.users[":id"].$patch({
      param: { id: randomUUID() },
      json: { firstName: "Ghost" },
    });

    expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
    const body = (await response.json()) as { message: string };
    expect(body).toEqual({ message: HttpStatusPhrases.NOT_FOUND });
  });

  it("deletes an existing user", async () => {
    const { user } = await createUserFixture();
    const response = await client.users[":id"].$delete({
      param: { id: user.id },
    });

    expect(response.status).toBe(HttpStatusCodes.NO_CONTENT);

    const getResponse = await client.users[":id"].$get({
      param: { id: user.id },
    });
    expect(getResponse.status).toBe(HttpStatusCodes.NOT_FOUND);
  });

  it("returns 404 when deleting a missing user", async () => {
    const response = await client.users[":id"].$delete({
      param: { id: randomUUID() },
    });

    expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
    const body = (await response.json()) as { message: string };
    expect(body).toEqual({ message: HttpStatusPhrases.NOT_FOUND });
  });
});
