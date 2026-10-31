import Offcanvas from "react-bootstrap/Offcanvas";
import { IconCode, IconSearch, IconSettings, IconSun, type Icon } from "@tabler/icons-react";
import { useBackClose } from "../hooks/useBackClose";
import "./PhoneMenu.css";

interface Props {
  show: boolean;
  onHide(): void;
  activeTab: string;
  /** All PRs is usable: a GitHub org is set up and the tab isn't hidden. */
  prSearchAvailable: boolean;
  onNavigate(tab: string): void;
}

interface Item {
  key: string;
  label: string;
  icon: Icon;
}

/** The phone's app menu, behind the top bar's ☰: the pages a phone can show. */
export function PhoneMenu({ show, onHide, activeTab, prSearchAvailable, onNavigate }: Props) {
  useBackClose(show, onHide);

  const pages: Item[] = [
    { key: "workday", label: "Workday", icon: IconSun },
    ...(prSearchAvailable ? [{ key: "org-prs", label: "PR search", icon: IconSearch }] : []),
  ];
  const item = ({ key, label, icon: ItemIcon }: Item) => (
    <button
      key={key}
      type="button"
      className={`phone-menu__item${activeTab === key ? " is-current" : ""}`}
      aria-current={activeTab === key ? "page" : undefined}
      onClick={() => {
        onNavigate(key);
        onHide();
      }}
    >
      <ItemIcon size={18} aria-hidden="true" />
      {label}
    </button>
  );

  return (
    <Offcanvas
      show={show}
      onHide={onHide}
      placement="start"
      className="phone-menu"
      aria-labelledby="phone-menu-title"
    >
      <Offcanvas.Header closeButton>
        <Offcanvas.Title id="phone-menu-title" className="phone-menu__title">
          <IconCode size={16} aria-hidden="true" />
          Dev Home
        </Offcanvas.Title>
      </Offcanvas.Header>
      <Offcanvas.Body className="phone-menu__body">
        {pages.map(item)}
        <div className="phone-menu__sep" role="separator" />
        {item({ key: "settings", label: "Settings", icon: IconSettings })}
      </Offcanvas.Body>
    </Offcanvas>
  );
}
