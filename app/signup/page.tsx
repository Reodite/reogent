import { AuthPage } from "@/src/components/auth/auth-form";
import { getAuthMode } from "@/src/server/auth-mode";
import { connection } from "next/server";

export default async function SignupPage() {
  await connection();
  const authMode = getAuthMode();
  return <AuthPage mode="signup" authMode={authMode} providerIds={authMode === "oauth" ? ["google"] : []} />;
}
