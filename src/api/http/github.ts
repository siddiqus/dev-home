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

/** Execute a GitHub GraphQL query; throws if the response carries `errors`. */
export async function githubGraphql<T = any>(
  query: string,
  variables: Record<string, any> = {},
  opts: { signal?: AbortSignal } = {},
): Promise<T> {
  const { githubToken } = requireSettings();
  const { data: body } = await request<GraphQLResponse<T>>("post", `${GITHUB_API}/graphql`, {
    data: { query, variables },
    headers: { Authorization: `Bearer ${githubToken}` },
    signal: opts.signal,
  });

  if (body.errors && body.errors.length > 0) {
    const messages = body.errors.map((e) => e.message).join("; ");
    const error: any = new Error(`GitHub GraphQL error: ${messages}`);
    error.graphqlErrors = body.errors;
    throw error;
  }
  return body.data;
}
