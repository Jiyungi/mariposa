# Seed Couple (Fictional)

The single synthetic couple used to seed the app so nothing is typed live during the demo.
These are **invented characters**, not real people — no real PHI. Values are grounded in the
realistic ranges in the other reference files. Cross-reference:
`semen-analysis-reference.md`, `female-hormone-reference.md`, `cycle-fertility-reference.md`,
`insurance-coverage-data.md`, `clinic-intake-data.md`.

## Couple

```
couple:
  id: couple_001
  display_name: "Maya & Daniel"
  trying_since_months: 8
  goal: "Understand our timing, get the right tests, and enter care prepared"
  top_concern: "We're not sure if we're missing tests or wasting time"
  insurance:
    provider: "Pacific Crest Health"   # fictional
    plan_type: PPO
    member_id: "PCH-0000-1234"         # fake placeholder
    group_number: "GRP-558823"         # fake placeholder
    policy_holder: him
    coverage_status: partial_unconfirmed
```

## Her profile — "Maya" (fictional)

```
member:
  role: her
  name: "Maya"
  age: 33
  dob: "1992-09-14"          # fictional
her_profile:
  last_period_start: "2026-06-01"
  avg_cycle_length: 52        # range 45-60
  cycle_length_min: 45
  cycle_length_max: 60
  cycle_regular: false
  months_trying: 8
  conditions: ["suspected PCOS (not confirmed)"]
  prior_meds: ["letrozole 2.5 mg (2026-03, 1 cycle)"]
  ovulation_tracking: "app only, no LH/progesterone confirmation"
  prior_pregnancies: 0
  labs:
    amh: 1.6            # ng/mL, normal
    tsh: 2.1            # normal
    day3_fsh: null      # MISSING
    day3_estradiol: null # MISSING
    mid_luteal_progesterone: null # MISSING - can't confirm ovulation
    prolactin: null     # MISSING
```

## His profile — "Daniel" (fictional)

```
member:
  role: him
  name: "Daniel"
  age: 35
  dob: "1990-11-02"          # fictional
him_profile:
  semen_analysis_status: completed
  semen_analysis_date: "2026-05-20"
  semen_results:
    volume_ml: 2.1
    concentration_million_ml: 14    # below WHO 16 -> flag
    total_count_million: 29         # below WHO 39 -> flag
    progressive_motility_pct: 28    # below WHO 30 -> flag
    total_motility_pct: 44          # normal
    morphology_normal_pct: 3        # below WHO 4 -> flag
    vitality_pct: 60                # normal
    ph: 7.4
  lifestyle:
    smoking: false
    alcohol: "moderate"
    heat_exposure: true             # frequent sauna -> flag
    sleep: "ok"
    stress: "high"
    bmi: 27
    supplements: false
  medical_history:
    surgeries: none
    varicocele: unknown
    medications: none
    prior_children: 0
  readiness_score: 62   # out of 100, improves as tasks complete
```

## Derived outputs the app should produce from this seed

- **Trying window:** June 27 – July 18, 2026; priority July 2 – July 17, 2026; confidence **Low**
  (irregular cycle, ovulation not confirmed, wide range). See `cycle-fertility-reference.md`.
- **Missing data flags:** day-3 FSH/estradiol, mid-luteal progesterone (ovulation unconfirmed),
  prolactin; repeat/borderline semen analysis; insurance coverage unconfirmed.
- **Trying-duration rule:** Maya is 33 (< 35) → 12-month threshold. At 8 months, but irregular
  cycles + borderline semen analysis are red flags → agent recommends early evaluation.
- **Tasks (her/his/together):** see `clinic-intake-data.md` booking outcome.
- **Calls:** insurance verification + clinic booking (see `call-scripts.md`).
