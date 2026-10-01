import axios, { type AxiosInstance } from "axios";
import { requireSettings } from "./credentials";
import { toApiError } from "./errors";

export const GITHUB_API = "https://api.github.com";

interface GraphQLResponse<T> {
  data: T;
  errors?: Array<{ message: string; locations?: any[]; path?: string[] }>;
}

/** GitHub REST client using the user's token. Built per call so settings changes apply. */
export function githubRest(): AxiosInstance {
  const { githubToken } = requireSettings();
  const client = axios.create({
    baseURL: GITHUB_API,
    headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github+json" },
  });
  client.interceptors.response.use(undefined, (err) => Promise.reject(toApiError(err)));
  return client;
}

/** Execute a GitHub GraphQL query; throws if the response carries `errors`. */
export async function githubGraphql<T = any>(
  query: string,
  variables: Record<string, any> = {},
): Promise<T> {
  const { githubToken } = requireSettings();
  let body: GraphQLResponse<T>;
  try {
    const response = await axios.post<GraphQLResponse<T>>(
      `${GITHUB_API}/graphql`,
      { query, variables },
      { headers: { Authorization: `Bearer ${githubToken}`, "Content-Type": "application/json" } },
    );
    body = response.data;
  } catch (err) {
    throw toApiError(err);
  }

  if (body.errors && body.errors.length > 0) {
    const messages = body.errors.map((e) => e.message).join("; ");
    const error: any = new Error(`GitHub GraphQL error: ${messages}`);
    error.graphqlErrors = body.errors;
    throw error;
  }
  return body.data;
}
