import { currentUser } from "@/lib/auth";
import { bad, json } from "@/lib/api";
import { getDb } from "@/lib/db";
import { sendToUser } from "@/lib/push";

export async function POST() {
  const u = await currentUser();
  if (!u) return bad("Нужно войти", 401);
  const n = await sendToUser(getDb(), u.id, { title: "Кампус", body: "Уведомления работают 🎉", tag: "test", url: "/" });
  return n ? json({ delivered: n }) : bad("Не удалось доставить: нет активных подписок", 409);
}
