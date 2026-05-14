import Store from "electron-store";

interface Settings {
  jiraBaseUrl: string;
  jiraEmail: string;
  jiraApiToken: string;
  githubToken: string;
  githubUsername: string;
  githubOrg: string;
}

const store = new Store<Settings>({
  name: "dev-home-settings",
  schema: {
    jiraBaseUrl: {
      type: "string",
      default: "",
    },
    jiraEmail: {
      type: "string",
      default: "",
    },
    jiraApiToken: {
      type: "string",
      default: "",
    },
    githubToken: {
      type: "string",
      default: "",
    },
    githubUsername: {
      type: "string",
      default: "",
    },
    githubOrg: {
      type: "string",
      default: "",
    },
  },
});

export function getSettings(): Settings {
  return {
    jiraBaseUrl: store.get("jiraBaseUrl"),
    jiraEmail: store.get("jiraEmail"),
    jiraApiToken: store.get("jiraApiToken"),
    githubToken: store.get("githubToken"),
    githubUsername: store.get("githubUsername"),
    githubOrg: store.get("githubOrg"),
  };
}

export function setSettings(settings: Partial<Settings>): void {
  if (settings.jiraBaseUrl !== undefined) store.set("jiraBaseUrl", settings.jiraBaseUrl);
  if (settings.jiraEmail !== undefined) store.set("jiraEmail", settings.jiraEmail);
  if (settings.jiraApiToken !== undefined) store.set("jiraApiToken", settings.jiraApiToken);
  if (settings.githubToken !== undefined) store.set("githubToken", settings.githubToken);
  if (settings.githubUsername !== undefined) store.set("githubUsername", settings.githubUsername);
  if (settings.githubOrg !== undefined) store.set("githubOrg", settings.githubOrg);
}

export function isConfigured(): boolean {
  const settings = getSettings();
  return (
    settings.jiraBaseUrl.length > 0 &&
    settings.jiraEmail.length > 0 &&
    settings.jiraApiToken.length > 0 &&
    settings.githubToken.length > 0 &&
    settings.githubUsername.length > 0
  );
}
