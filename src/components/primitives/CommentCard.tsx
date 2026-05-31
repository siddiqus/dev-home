import React from "react";
import "./CommentCard.css";

interface CommentCardProps {
  children: React.ReactNode;
  className?: string;
}

export const CommentCard: React.FC<CommentCardProps> = ({ children, className = "" }) => (
  <div className={`comment-card ${className}`.trim()}>{children}</div>
);
