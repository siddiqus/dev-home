import { GitHubPR, GitHubComment, GitHubReviewRequest } from '../types';
import { API_BASE } from './config';

export async function fetchOpenPRs(): Promise<GitHubPR[]> {
  const response = await fetch(`${API_BASE}/github/prs`);

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Failed to fetch open PRs (${response.status}): ${errorBody}`
    );
  }

  const data = await response.json();
  return data.prs;
}

export async function fetchReviewRequests(): Promise<GitHubReviewRequest[]> {
  const response = await fetch(`${API_BASE}/github/reviews`);

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Failed to fetch review requests (${response.status}): ${errorBody}`
    );
  }

  const data = await response.json();
  return data.reviews;
}

export async function fetchMentions(): Promise<GitHubComment[]> {
  const response = await fetch(`${API_BASE}/github/mentions`);

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Failed to fetch GitHub mentions (${response.status}): ${errorBody}`
    );
  }

  const data = await response.json();
  return data.mentions;
}
