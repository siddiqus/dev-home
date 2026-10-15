import React from "react";

/** The signed-in GitHub login ("" when unknown): skips the author on my own PRs
    and decides whose seat a PR's next-action tag is written from. */
export const ViewerLoginContext = React.createContext("");
