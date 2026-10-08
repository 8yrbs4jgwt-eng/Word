import { json } from "@/lib/api";
import { getVapid } from "@/lib/push";

export const GET = async () => json({ publicKey: (await getVapid()).publicKey });
