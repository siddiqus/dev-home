import { GitHubPR, GitHubComment, GitHubReviewRequest } from "../types";
import { apiClient } from "./config";

export async function fetchOpenPRs(): Promise<{ prs: GitHubPR[]; prComments: GitHubComment[] }> {
  const { data } = await apiClient.get("/github/prs");
  return { prs: data.prs, prComments: data.pr_comments || [] };
}

export async function fetchReviewRequests(): Promise<GitHubReviewRequest[]> {
  const { data } = await apiClient.get("/github/reviews");
  return data.reviews;
}

export async function fetchMentions(): Promise<GitHubComment[]> {
  const { data } = await apiClient.get("/github/mentions");
  return data.mentions;
}

export interface OrgPRsPage {
  prs: GitHubPR[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

export async function fetchOrgPRs(cursor?: string, author?: string): Promise<OrgPRsPage> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  if (author) params.author = author;
  const { data } = await apiClient.get("/github/org-prs", { params });
  return data;
}

export interface OrgMember {
  login: string;
  avatar_url: string;
}

export async function fetchOrgMembers(): Promise<OrgMember[]> {
  const { data } = await apiClient.get("/github/org-members");
  return data.members;
}
