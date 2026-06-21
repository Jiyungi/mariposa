import type { CoupleData } from "@/lib/chat/grounded-chat";
import { SEED_COUPLE_FIXTURE } from "@/lib/reference";
import { getSupabaseClient } from "@/lib/db/client";
import {
  getCouple,
  getHerProfile,
  getHimProfile,
  getMembers,
} from "@/lib/db/queries";

/**
 * Load couple_001 for RAG prompts. Uses Supabase when configured, else seed fixture.
 */
export async function loadCoupleContext(
  coupleId = "couple_001",
): Promise<CoupleData> {
  const client = getSupabaseClient();
  if (!client) return SEED_COUPLE_FIXTURE;

  try {
    const [couple, members, herProfile, himProfile] = await Promise.all([
      getCouple(client, coupleId),
      getMembers(client, coupleId),
      getHerProfile(client, coupleId),
      getHimProfile(client, coupleId),
    ]);

    if (!couple || !herProfile || !himProfile || members.length === 0) {
      return SEED_COUPLE_FIXTURE;
    }

    return {
      couple: couple as CoupleData["couple"],
      members: members as CoupleData["members"],
      herProfile: herProfile as CoupleData["herProfile"],
      himProfile: himProfile as CoupleData["himProfile"],
    };
  } catch {
    return SEED_COUPLE_FIXTURE;
  }
}
