import { describe, it, expect } from "vitest";
import { hasAttachmentUrls, hasSignedAttachments, signAttachmentUrls } from "./attachments";

const UUID = "0f590dfb-04c5-4944-8947-d39c46e0ba15";
const OTHER = "c9caf2c0-f941-493a-bf98-84c625865943";
const signed = (uuid: string) =>
  `https://private-user-images.githubusercontent.com/5023858/684736575-${uuid}.png?jwt=abc.def&X-Amz-Expires=300`;
/** An <img> as GitHub's bodyHTML renders it: signed src, `&` escaped. */
const htmlImg = (uuid: string) => `<img alt="image" src="${signed(uuid).replace(/&/g, "&amp;")}">`;

describe("signAttachmentUrls", () => {
  it("swaps an <img> attachment for its signed URL", () => {
    const body = `before <img width="400" src="https://github.com/user-attachments/assets/${UUID}" /> after`;
    expect(signAttachmentUrls(body, htmlImg(UUID))).toBe(
      `before <img width="400" src="${signed(UUID)}" /> after`,
    );
  });

  it("swaps a markdown image attachment", () => {
    const body = `![shot](https://github.com/user-attachments/assets/${UUID})`;
    expect(signAttachmentUrls(body, htmlImg(UUID))).toBe(`![shot](${signed(UUID)})`);
  });

  it("swaps the older repo-scoped asset URLs", () => {
    const body = `![shot](https://github.com/acme/app/assets/12345/${UUID})`;
    expect(signAttachmentUrls(body, htmlImg(UUID))).toBe(`![shot](${signed(UUID)})`);
  });

  it("matches each attachment to its own signed URL", () => {
    const body = [
      `![a](https://github.com/user-attachments/assets/${UUID})`,
      `![b](https://github.com/user-attachments/assets/${OTHER})`,
    ].join("\n");
    const html = htmlImg(OTHER) + htmlImg(UUID);
    expect(signAttachmentUrls(body, html)).toBe(
      [`![a](${signed(UUID)})`, `![b](${signed(OTHER)})`].join("\n"),
    );
  });

  it("leaves an attachment alone when the HTML has no signed URL for it", () => {
    const body = `![shot](https://github.com/user-attachments/assets/${UUID})`;
    expect(signAttachmentUrls(body, htmlImg(OTHER))).toBe(body);
    expect(signAttachmentUrls(body, "")).toBe(body);
  });

  it("leaves other images untouched", () => {
    const body = "![x](https://example.com/a.png)";
    expect(signAttachmentUrls(body, htmlImg(UUID))).toBe(body);
  });
});

describe("hasSignedAttachments", () => {
  it("spots a body carrying signed (expiring) image URLs", () => {
    expect(hasSignedAttachments(`![a](${signed(UUID)})`)).toBe(true);
    expect(hasSignedAttachments(`![a](https://github.com/user-attachments/assets/${UUID})`)).toBe(
      false,
    );
    expect(hasSignedAttachments("")).toBe(false);
  });
});

describe("hasAttachmentUrls", () => {
  it("spots pasted attachments that need signing", () => {
    expect(hasAttachmentUrls(`![a](https://github.com/user-attachments/assets/${UUID})`)).toBe(
      true,
    );
    expect(hasAttachmentUrls(`<img src="https://github.com/acme/app/assets/9/${UUID}">`)).toBe(
      true,
    );
    // Repeat calls give the same answer (no regex lastIndex carry-over).
    expect(hasAttachmentUrls(`![a](https://github.com/user-attachments/assets/${UUID})`)).toBe(
      true,
    );
    expect(hasAttachmentUrls("![x](https://example.com/a.png)")).toBe(false);
    expect(hasAttachmentUrls(`![a](${signed(UUID)})`)).toBe(false);
  });
});
