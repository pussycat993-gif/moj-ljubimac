import type { ReactNode } from "react";
import { AuthShell } from "@/components/app/shells";

// Auth shell (Design §5.4): centred card on the cream ground, logo above.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
