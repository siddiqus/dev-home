import React from "react";
import "./Card.css";

interface CardProps {
  variant?: "default" | "interactive";
  className?: string;
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ variant = "default", className = "", children }) => (
  <div className={`card card--${variant} ${className}`.trim()}>{children}</div>
);
