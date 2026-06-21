# Grok Voice Call Scripts (Simulated)

Dialogue plans for the Grok Voice agent (F6) and its mock "rep/clinic" responder. The
questions are grounded in the real checklists in `insurance-coverage-data.md` and
`clinic-intake-data.md`. No real phone calls, no Twilio — the other party is a scripted/mock
responder (or a second Grok voice). The agent reads from the seed couple's "authorization
packet" and extracts a structured result.

## Authorization packet (what the agent has before any call)

```
caller_identity: "Mariposa, an authorized assistant calling on behalf of the patient"
patient_names: ["Maya", "Daniel"]
dob: { her: "1992-09-14", him: "1990-11-02" }   # fictional
insurance: { provider: "Pacific Crest Health", member_id: "PCH-0000-1234",
             group_number: "GRP-558823", policy_holder: "him" }
call_objective: <set per call>
guardrails:
  - Only share member ID / DOB when the rep asks to verify identity.
  - Do not make medical decisions or accept treatment on the couple's behalf.
  - Confirm everything back; create follow-up tasks instead of committing to anything binding.
```

---

## CALL 1 — Insurance verification

**Objective:** confirm fertility coverage, prior auth, in-network labs, CPT coverage, costs.

### Agent opening
> "Hi, I'm Mariposa, calling on behalf of a member to verify fertility benefits. The policy
> holder is Daniel, member ID Pacific Crest Health PCH-0000-1234. Can I ask a few coverage
> questions?"

### Agent question list (asks in order; see insurance-coverage-data.md)
1. How does the plan define infertility / eligibility?
2. Is diagnostic fertility evaluation covered (visit, labs, ultrasound, HSG)?
3. Is semen analysis, CPT 89320, covered?
4. Are hormone labs (FSH 83001, AMH, estradiol 82670, progesterone 84144, TSH 84443) covered?
5. Is prior authorization required, and for what?
6. Which labs are in-network?
7. Deductible, coinsurance, out-of-pocket max?
8. Are IUI (58322) and IVF (58970) covered? Lifetime max?
9. Are fertility meds covered under pharmacy benefit?
10. Is a PCP/OB-GYN referral required?

### Mock rep responses (for the demo — from insurance-coverage-data.md sample plan)
- Infertility defined as 12 months trying (under 35).
- Diagnostic evaluation: covered after deductible.
- Semen analysis 89320: covered.
- Hormone labs + ultrasound: covered.
- Prior auth: required for IUI and IVF.
- In-network lab: "Crest Diagnostics" (fictional).
- Deductible $1,500; coinsurance 20%; OOP max $4,000.
- IUI/IVF: covered with prior auth; lifetime max applies.
- Meds: separate pharmacy benefit, partial.
- Referral: not required for in-network REI.

### Structured result the agent extracts
```
{
  "diagnostic_covered": true,
  "semen_analysis_covered": true,
  "hormone_labs_covered": true,
  "prior_auth_required_for": ["IUI", "IVF"],
  "in_network_lab": "Crest Diagnostics",
  "deductible": 1500, "coinsurance_pct": 20, "oop_max": 4000,
  "referral_required": false,
  "follow_up_tasks": [
    "Confirm CPT codes with clinic before booking",
    "Use Crest Diagnostics for in-network labs",
    "Submit prior auth before any IUI/IVF"
  ]
}
```

---

## CALL 2 — Clinic booking

**Objective:** confirm new-patient + both-partner eval, in-network, what to bring, book a slot.

### Agent opening
> "Hi, I'm Mariposa, helping a couple prepare for a first fertility consult. Are you accepting
> new patients, and do you take Pacific Crest Health PPO?"

### Agent question list (see clinic-intake-data.md)
1. Accepting new patients? Earliest consult slot?
2. Do you evaluate both partners? Can male testing be ordered early?
3. In-network with Pacific Crest Health?
4. What should they bring?
5. Can billing provide CPT codes before booking?
6. Referral required?
7. Telehealth first visit available?

### Mock clinic responses (from clinic-intake-data.md sample clinic)
- New patients: yes. Slots: Jun 23 (virtual), Jun 25 (in person), Jun 29 (in person).
- Both partners evaluated; semen analysis can be ordered early.
- In-network with Pacific Crest Health PPO: yes.
- Bring: ID, insurance card, cycle history, prior meds, semen analysis, any labs.
- Billing can provide CPT codes on request.
- Referral: not required.
- Telehealth first visit: available.

### Structured result the agent extracts
```
{
  "booked": { "date": "2026-06-25", "time": "14:00", "mode": "in_person",
              "clinic": "Bay Area Fertility & Reproductive Health" },
  "bring_list": ["ID","insurance card","cycle history","prior meds","semen analysis","labs"],
  "tasks": {
    "her": ["Gather cycle history", "Bring AMH result"],
    "him": ["Bring semen analysis", "Request urology note"],
    "together": ["Confirm insurance card", "Complete intake forms before visit"]
  },
  "calendar_event": { "type": "doctor_consult", "date": "2026-06-25", "time": "14:00" }
}
```

---

## After both calls (agent write-back — F7 workflow)
1. Create the calendar consult event (Jun 25).
2. Create the her/his/together tasks.
3. Update the doctor-ready summary with coverage facts + appointment + bring-list.
4. Mark insurance coverage_status = "verified (partial)".
