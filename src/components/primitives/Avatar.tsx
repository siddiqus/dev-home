import React from "react";
import "./Avatar.css";

interface AvatarProps {
  src: string;
  alt: string;
  size?: "sm" | "md";
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  alt,
  size = "sm",
  className = "",
  style,
  title,
}) => (
  <img
    src={src}
    alt={alt}
    title={title}
    className={`avatar avatar--${size} ${className}`.trim()}
    style={style}
  />
);
