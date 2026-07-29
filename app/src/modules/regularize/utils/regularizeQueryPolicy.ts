export type RegularizeTabId =
  | "dashboard"
  | "processes"
  | "licenses"
  | "pf"
  | "partners"
  | "passwords"
  | "sites"
  | "taxes";

export interface RegularizeQueryPolicy {
  dashboard: boolean;
  clientPfs: boolean;
  sitePasswords: boolean;
  municipalTaxes: boolean;
  processes: boolean;
  licenses: boolean;
  partners: boolean;
  passwords: boolean;
  guidance: boolean;
}

export function getRegularizeQueryPolicy(
  activeTab: RegularizeTabId,
): RegularizeQueryPolicy {
  return {
    dashboard: activeTab === "dashboard",
    clientPfs:
      activeTab === "pf" || activeTab === "partners" || activeTab === "processes",
    sitePasswords: activeTab === "sites" || activeTab === "passwords",
    municipalTaxes: activeTab === "taxes",
    processes: activeTab === "processes",
    licenses: activeTab === "licenses",
    partners: activeTab === "partners",
    passwords: activeTab === "passwords",
    guidance: activeTab === "processes",
  };
}
