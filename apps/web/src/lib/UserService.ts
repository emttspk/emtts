import { api } from "./api";
import type { MeResponse } from "./types";

export async function fetchMe() {
  return api<MeResponse>("/api/me");
}
