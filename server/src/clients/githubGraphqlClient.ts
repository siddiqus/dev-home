import axios, { AxiosResponse } from "axios";
import { getConfig } from "../config";

const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";

interface GraphQLResponse<T = any> {
  data: T;
  errors?: Array<{ message: string; locations?: any[]; path?: string[] }>;
}

/**
 * Execute a GitHub GraphQL query.
 * Creates a fresh request each call so it always picks up the latest token.
 */
export async function graphql<T = any>(
  query: string,
  variables: Record<string, any> = {},
): Promise<T> {
  const config = getConfig();

  const response: AxiosResponse<GraphQLResponse<T>> = await axios.post(
    GITHUB_GRAPHQL_URL,
    { query, variables },
    {
      headers: {
        Authorization: `Bearer ${config.githubToken}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (response.data.errors && response.data.errors.length > 0) {
    const messages = response.data.errors.map((e) => e.message).join("; ");
    const error: any = new Error(`GitHub GraphQL error: ${messages}`);
    error.graphqlErrors = response.data.errors;
    throw error;
  }

  return response.data.data;
}
