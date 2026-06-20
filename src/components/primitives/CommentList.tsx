import React from "react";
import Spinner from "react-bootstrap/Spinner";
import { EmptyState } from "../EmptyState";

interface CommentListEmptyState {
  icon: React.ReactNode;
  title: string;
  description: string;
}

interface CommentListProps {
  loading: boolean;
  isEmpty: boolean;
  emptyState: CommentListEmptyState;
  children: React.ReactNode;
}

/**
 * Shared shell for comment/mention lists: loading spinner, empty state, and the
 * vertical list wrapper. Callers render their own CommentCard children.
 */
export const CommentList: React.FC<CommentListProps> = ({
  loading,
  isEmpty,
  emptyState,
  children,
}) => {
  if (loading && isEmpty) {
    return (
      <div className="d-flex justify-content-center align-items-center py-5">
        <Spinner animation="border" variant="secondary" />
      </div>
    );
  }

  if (isEmpty) {
    return (
      <EmptyState
        icon={emptyState.icon}
        title={emptyState.title}
        description={emptyState.description}
      />
    );
  }

  return <div className="d-flex flex-column gap-2">{children}</div>;
};
