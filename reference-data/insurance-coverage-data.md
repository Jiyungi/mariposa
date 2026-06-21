# Insurance Coverage Reference

Real fertility-insurance terminology, the questions a patient (or the Mariposa agent) should ask,
and a fictional sample plan for the seed couple. Member IDs/group numbers are fake placeholders.

## How fertility coverage actually works (real context)

- Only about **21 US states** have any fertility-insurance mandate, and requirements vary
  widely; coverage can range from diagnostic testing only to full IVF, or nothing.
  Self-funded employer plans can be exempt from state mandates.
  Source: [Healthcare Insider](https://healthcareinsider.com/does-health-insurance-cover-ivf-and-other-fertility-treatments).
- Most US patients have **no IVF coverage**; even with coverage, expect out-of-pocket costs.
  Source: [FertilityIQ Insurance 101](https://www.fertilityiq.com/fertilityiq/fertility-on-a-budget/insurance-101).
- Most insurers **require prior authorization** for IUI and IVF, and some diagnostic
  procedures. Prior auth is not a guarantee of payment.
  Source: [Univ. of Michigan CRM](http://www.medicine.umich.edu/dept/crm/patient-resources/insurance-coverage-financial-information).

Content rephrased for compliance with licensing restrictions.

## Key terms (for UI tooltips + agent vocabulary)

| Term | Meaning |
| --- | --- |
| Prior authorization | Insurer approval required before a service or it won't be covered |
| In-network | Provider/lab contracted with the plan = lower cost |
| Deductible | Amount you pay before insurance starts paying |
| Coinsurance | % you pay after deductible |
| Copay | Flat fee per visit/service |
| Lifetime maximum | Cap on total fertility dollars/cycles the plan will ever cover |
| CPT code | Procedure code the insurer uses to determine coverage |
| Definition of infertility | How the policy defines eligibility (e.g. months of trying) |

## The insurance verification questions (real checklist — what the agent asks)

1. How does this plan **define infertility**, and do we meet it (how many months of trying)?
2. Is **diagnostic fertility evaluation** covered (office visit, labs, ultrasound, HSG)?
3. Is **semen analysis** (CPT 89320) covered?
4. Are **hormone labs** (FSH, AMH, estradiol, progesterone, TSH) covered?
5. Is **prior authorization** required, and for which services?
6. Which **labs/clinics are in-network**?
7. What is the **deductible, coinsurance, and out-of-pocket maximum**?
8. Are **IUI (58322)** and **IVF (58970)** covered, and is there a **lifetime maximum**?
9. Are **fertility medications** covered (separate pharmacy benefit)?
10. Do we need a **referral** from a PCP or OB-GYN?

Sources: [Fertility Out Loud — questions to ask](https://www.fertilityoutloud.com/content-hub/ten-questions-to-ask-about-your-insurance-coverage/),
[Insurance verification checklist](https://golean.health/financial/insurance-verification-checklist-for-medical-practices/).
Content rephrased for compliance.

## Sample plan for the seed couple (FICTIONAL)

```
provider:        "Pacific Crest Health" (fictional)
plan_type:       PPO
member_id:       PCH-0000-1234   (fake placeholder)
group_number:    GRP-558823      (fake placeholder)
policy_holder:   him
coverage_status: partial / unconfirmed
```

### What a simulated verification call would return (for the demo)
- Definition of infertility: 12 months of trying (under 35) — couple qualifies (trying 8+ mo
  but flagged for early eval due to irregular cycles → ask doctor).
- Diagnostic evaluation: **covered** after deductible.
- Semen analysis (89320): **covered** as diagnostic.
- Hormone labs: **covered**; ultrasound covered.
- IUI/IVF: **prior authorization required**; lifetime max applies.
- In-network lab: "Crest Diagnostics" (fictional).
- Action items the agent extracts: confirm CPT codes with clinic before booking; confirm
  in-network lab; submit prior auth before any IUI/IVF.
