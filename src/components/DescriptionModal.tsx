import React from "react";
import Modal from "react-bootstrap/Modal";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";

interface DescriptionModalProps {
  show: boolean;
  onHide: () => void;
  title: string;
  subtitle?: string;
  description: string;
  url?: string;
}

export const DescriptionModal: React.FC<DescriptionModalProps> = ({
  show,
  onHide,
  title,
  subtitle,
  description,
  url,
}) => {
  return (
    <Modal show={show} onHide={onHide} size="lg" centered className="description-modal">
      <Modal.Header closeButton>
        <Modal.Title>
          <div>
            <div style={{ fontSize: "1rem", fontWeight: 600 }}>{title}</div>
            {subtitle && (
              <div
                className="text-secondary-custom"
                style={{ fontSize: "0.75rem", fontWeight: 400, marginTop: 2 }}
              >
                {subtitle}
              </div>
            )}
          </div>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {description ? (
          <div className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkBreaks]}>{description}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-secondary-custom" style={{ fontStyle: "italic" }}>
            No description provided.
          </p>
        )}
      </Modal.Body>
      {url && (
        <Modal.Footer>
          <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.8125rem" }}>
            Open in browser
          </a>
        </Modal.Footer>
      )}
    </Modal>
  );
};
