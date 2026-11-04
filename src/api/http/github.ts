import { createClient, request, type HttpClient } from "./client";
import { requireSettings } from "./credentials";

export const GITHUB_API = "https://api.github.com";

interface GraphQLResponse<T> {
  data: T;
  errors?: Array<{ message: string; locations?: any[]; path?: string[] }>;
}

/** GitHub REST client using the user's token. Built per call so settings changes apply. */
export function githubRest(): HttpClient {
  const { githubToken } = requireSettings();
  return createClient(GITHUB_API, {
    Authorization: `Bearer ${githubToken}`,
    Accept: "application/vnd.github+json",
  });
}

/**
 * Execute a GitHub GraphQL query. Throws if the response carries `errors` and
 * `data` is null; with `allowPartial`, returns partial data when `data` is
 * present (one bad item in a batch doesn't sink the rest).
 */
export async function githubGraphql<T = any>(
  query: string,
  variables: Record<string, any> = {},
  opts: { signal?: AbortSignal; allowPartial?: boolean } = {},
): Promise<T> {
  const { githubToken } = requireSettings();
  const { data: body } = await request<GraphQLResponse<T>>("post", `${GITHUB_API}/graphql`, {
    data: { query, variables },
    headers: { Authorization: `Bearer ${githubToken}` },
    signal: opts.signal,
  });

  // allowPartial: batched lookups where one bad item (a deleted repo) mustn't
  // sink the rest; its alias comes back null alongside the error.
  const partialOk = opts.allowPartial && body.data != null;
  if (body.errors && body.errors.length > 0 && !partialOk) {
    const messages = body.errors.map((e) => e.message).join("; ");
    const error: any = new Error(`GitHub GraphQL error: ${messages}`);
    error.graphqlErrors = body.errors;
    throw error;
  }
  return body.data;
}
