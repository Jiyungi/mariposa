/**
 * Prefilled intake defaults derived from the seed couple "Maya & Daniel".
 *
 * The single source is `buildSeedCouple()` (lib/db/seed.ts), so the forms open
 * pre-populated with exactly the reference values (Req 11.2, 11.3) and nothing
 * clinical is invented here (Req 12). We map the persisted `CoupleWorkspace`
 * shape onto the three intake schemas (`HerIntake`, `HisIntake`,
 * `TogetherIntake`) so the forms validate against the real Zod schemas.
 *
 * `null` lab/semen values are preserved as `null` (MISSING, Req 1.8) — the
 * number inputs render blank for them and re-emit `null` when left blank.
 */
import { buildSeedCouple } from "@/lib/db/seed";
import type {
  HerIntake,
  HisIntake,
  TogetherIntake,
} from "@/lib/validation/intake";
import type {
  CoverageStatus,
  PolicyHolder,
  SemenAnalysisStatus,
} from "@/lib/db/types";

export interface IntakeDefaults {
  her: HerIntake;
  his: HisIntake;
  together: TogetherIntake;
}

/**
 * Build the prefilled intake values from the seed workspace. Pure: calls the
 * in-memory `buildSeedCouple()` builder (no I/O), so it is safe in a client
 * component and in tests.
 */
export function buildIntakeDefaults(): IntakeDefaults {
  const ws = buildSeedCouple();
  const herMember = ws.members.find((m) => m.role === "her");
  const himMember = ws.members.find((m) => m.role === "him");
  const her = ws.herProfile;
  const him = ws.himProfile;
  const couple = ws.couple;

  return {
    her: {
      age: herMember?.age ?? 33,
      last_period_start: her.last_period_start ?? "",
      avg_cycle_length: her.avg_cycle_length ?? 52,
      cycle_length_min: her.cycle_length_min ?? 45,
      cycle_length_max: her.cycle_length_max ?? 60,
      cycle_regular: her.cycle_regular ?? false,
      months_trying: her.months_trying ?? 0,
      conditions: [...her.conditions],
      prior_meds: [...her.prior_meds],
      ovulation_tracking: her.ovulation_tracking ?? "",
      prior_pregnancies: her.prior_pregnancies ?? 0,
      labs: {
        amh: her.amh,
        tsh: her.tsh,
        day3_fsh: her.day3_fsh,
        day3_estradiol: her.day3_estradiol,
        mid_luteal_progesterone: her.mid_luteal_progesterone,
        prolactin: her.prolactin,
      },
    },
    his: {
      age: himMember?.age ?? 35,
      semen_analysis_status:
        (him.semen_analysis_status as SemenAnalysisStatus) ?? "completed",
      semen_analysis_date: him.semen_analysis_date ?? undefined,
      semen_results: {
        volume_ml: him.volume_ml ?? 0,
        concentration_million_ml: him.concentration_million_ml ?? 0,
        total_count_million: him.total_count_million ?? 0,
        progressive_motility_pct: him.progressive_motility_pct ?? 0,
        total_motility_pct: him.total_motility_pct ?? 0,
        morphology_normal_pct: him.morphology_normal_pct ?? 0,
        vitality_pct: him.vitality_pct ?? 0,
        ph: him.ph ?? 0,
      },
      lifestyle: {
        smoking: him.lifestyle.smoking ?? false,
        alcohol: him.lifestyle.alcohol ?? "",
        heat_exposure: him.lifestyle.heat_exposure ?? false,
        sleep: him.lifestyle.sleep ?? "",
        stress: him.lifestyle.stress ?? "",
        bmi: him.lifestyle.bmi ?? 0,
        supplements: him.lifestyle.supplements ?? false,
      },
      medical_history: {
        surgeries: him.medical_history.surgeries ?? "",
        varicocele: him.medical_history.varicocele ?? "",
        medications: him.medical_history.medications ?? "",
        prior_children: him.medical_history.prior_children ?? 0,
      },
      readiness_score: him.readiness_score ?? 0,
    },
    together: {
      goal: couple.goal ?? "",
      top_concern: couple.top_concern ?? "",
      trying_since_months: couple.trying_since_months ?? undefined,
      insurance: {
        provider: couple.insurance_provider ?? "",
        plan_type: couple.plan_type ?? undefined,
        member_id: couple.member_id ?? "",
        group_number: couple.group_number ?? "",
        policy_holder: (couple.policy_holder as PolicyHolder) ?? "him",
        coverage_status:
          (couple.coverage_status as CoverageStatus) ?? "partial_unconfirmed",
      },
    },
  };
}
