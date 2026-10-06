import { json } from "@/lib/api";
import { getVapid } from "@/lib/push";

export const GET = () => json({ publicKey: getVapid().publicKey });
