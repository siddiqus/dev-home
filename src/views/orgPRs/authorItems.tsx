import type { DropdownItem } from "../../components/SearchableDropdown";
import { TeamIcon } from "../../components/primitives/TeamIcon";
import type { OrgMember, OrgTeam } from "../../services/github";
import { teamValue } from "../../utils/authorPicks";

/**
 * The author picker's rows, shared by All PRs and the phone's PR search: Teams
 * (name, slug when it differs, member count) above People (login, profile name).
 */
export function authorItems(
  members: OrgMember[],
  teams: OrgTeam[],
  /** Match the avatars' size: 18 in the dropdown, 22 in the phone sheet. */
  iconSize = 18,
): DropdownItem[] {
  return [
    ...teams.map((t) => ({
      value: teamValue(t.slug),
      label: t.name,
      hint: t.slug !== t.name ? t.slug : undefined,
      glyph: <TeamIcon size={iconSize} />,
      count: t.members.length,
      group: "Teams",
    })),
    ...members.map((m) => ({
      value: m.login,
      label: m.login,
      hint: m.name ?? undefined,
      icon: m.avatar_url,
      group: teams.length > 0 ? "People" : undefined,
    })),
  ];
}
