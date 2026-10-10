export type RegularizeTabId =
  | "dashboard"
  | "processes"
  | "licenses"
  | "pf"
  | "partners"
  | "passwords"
  | "sites"
  | "taxes"
  | "groups"
  | "bidders";

export interface RegularizeQueryPolicy {
  dashboard: boolean;
  clientPfs: boolean;
  sitePasswords: boolean;
  municipalTaxes: boolean;
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
    licenses: activeTab === "licenses",
    partners: activeTab === "partners",
    passwords: activeTab === "passwords",
    guidance: activeTab === "processes",
  };
}
