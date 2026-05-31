import React from "react";
import "./BranchTag.css";

interface BranchTagProps {
  name: string;
  title?: string;
}

export const BranchTag: React.FC<BranchTagProps> = ({ name, title }) => (
  <span className="branch-tag" title={title ?? name}>
    {name}
  </span>
);
