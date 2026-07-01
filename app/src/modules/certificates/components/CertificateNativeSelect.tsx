import type { SelectHTMLAttributes } from "react";

import {
  CERTIFICATE_FILTER_MENU_SELECT_CLASSNAME,
  CERTIFICATE_SELECT_ARROW_STYLE,
} from "./certificateWorkspaceUi";

export type CertificateNativeSelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "style">;

export function CertificateNativeSelect({ className, ...props }: CertificateNativeSelectProps) {
  const selectClassName = className
    ? `${CERTIFICATE_FILTER_MENU_SELECT_CLASSNAME} ${className}`
    : CERTIFICATE_FILTER_MENU_SELECT_CLASSNAME;

  return <select {...props} className={selectClassName} style={CERTIFICATE_SELECT_ARROW_STYLE} />;
}
