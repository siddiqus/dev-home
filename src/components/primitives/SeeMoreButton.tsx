import React from "react";
import "./SeeMoreButton.css";

interface SeeMoreButtonProps {
  onClick: () => void;
  children: React.ReactNode;
}

export const SeeMoreButton: React.FC<SeeMoreButtonProps> = ({ onClick, children }) => (
  <button type="button" className="see-more-btn" onClick={onClick}>
    {children}
  </button>
);
