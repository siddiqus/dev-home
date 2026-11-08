import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchOrgMembers, type OrgMember } from "../../services/github";
import { searchJiraUsers } from "../../services/teams";
import { MemberSearchRow, suggestGithubMember } from "./MemberSearchRow";

vi.mock("../../services/github", () => ({ fetchOrgMembers: vi.fn() }));
vi.mock("../../services/teams", () => ({ searchJiraUsers: vi.fn() }));

const members: OrgMember[] = [
  { login: "abu-b", name: "Abu  Bakar", avatar_url: "" },
  { login: "rkhan", name: null, avatar_url: "" },
  { login: "sam1", name: "Sam Lee", avatar_url: "" },
  { login: "sam2", name: "Sam Lee", avatar_url: "" },
];

const jira = (displayName: string, accountId = displayName) => ({
  accountId,
  displayName,
  emailAddress: null,
  avatarUrl: "",
});

describe("suggestGithubMember", () => {
  it("finds the one member whose profile name is the Jira name, ignoring case and spacing", () => {
    expect(suggestGithubMember(members, "abu bakar")?.login).toBe("abu-b");
  });

  it("suggests no one when nobody or several people have that name", () => {
    expect(suggestGithubMember(members, "Rafi Khan")).toBeNull();
    expect(suggestGithubMember(members, "Sam Lee")).toBeNull();
    expect(suggestGithubMember(members, "  ")).toBeNull();
  });
});

describe("MemberSearchRow", () => {
  beforeEach(() => {
    vi.mocked(fetchOrgMembers).mockReset().mockResolvedValue(members);
    vi.mocked(searchJiraUsers)
      .mockReset()
      .mockResolvedValue([jira("Abu Bakar", "j-abu"), jira("Rafi Khan", "j-rafi")]);
  });

  async function pickJira(name: string) {
    const [jiraBox] = screen.getAllByRole("combobox");
    fireEvent.click(jiraBox);
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("Search Jira user…"), {
        target: { value: "ab" },
      });
    });
    fireEvent.mouseDown(screen.getByText(name));
  }

  it("picks the GitHub account whose name matches the picked Jira person, and adds both", async () => {
    const onAdd = vi.fn();
    render(<MemberSearchRow onAdd={onAdd} />);
    await act(async () => {});
    await pickJira("Abu Bakar");
    expect(screen.getByText("abu-b")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ jiraAccountId: "j-abu", githubUsername: "abu-b" }),
    );
  });

  it("drops a suggested account when the next Jira pick has no match", async () => {
    render(<MemberSearchRow onAdd={vi.fn()} />);
    await act(async () => {});
    await pickJira("Abu Bakar");
    await pickJira("Rafi Khan");
    expect(screen.getByText("Select GitHub member")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });
});
