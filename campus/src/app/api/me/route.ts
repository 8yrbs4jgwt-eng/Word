import { currentUser } from "@/lib/auth";
import { json } from "@/lib/api";

export async function GET() {
  const u = await currentUser();
  return json(u ? { user: { id: u.id, email: u.email, name: u.name }, settings: u.settings, feedToken: u.feedToken } : { user: null });
}
