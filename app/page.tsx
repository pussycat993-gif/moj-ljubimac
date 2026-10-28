import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { postSignInPath } from "@/lib/server/gates";

// Site root: no screen of its own. A visitor goes to S08 sign-in; a signed-in user
// goes where the EP-42 sign-in redirect sends them (postSignInPath).
export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/prijava");
  redirect(await postSignInPath(supabase, user, null));
}
