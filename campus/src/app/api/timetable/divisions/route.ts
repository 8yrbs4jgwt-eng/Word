import { getDivisions } from "@/lib/spbu/client";
import { upstream } from "@/lib/api";

export const GET = () => upstream(getDivisions);
