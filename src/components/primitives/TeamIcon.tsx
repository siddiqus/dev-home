import { IconUsersGroup } from "@tabler/icons-react";
import "./TeamIcon.css";

/**
 * A team's stand-in for an avatar: a group glyph in a rounded square, sized like
 * the avatars beside it. One look for teams in every picker.
 */
export function TeamIcon({ size = 18 }: { size?: number }) {
  return (
    <span className="team-icon" style={{ width: size, height: size }} aria-hidden="true">
      <IconUsersGroup size={Math.round(size * 0.65)} />
    </span>
  );
}
