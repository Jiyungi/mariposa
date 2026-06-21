# Clinic Intake & First-Appointment Reference

Real norms for a first fertility consultation: what to bring, what happens, and a fictional
sample clinic with slots for the booking-call demo.

## What to bring to the first fertility appointment (real checklist)

- Photo ID and insurance card / benefits summary
- Medical records from OB-GYN / primary care / prior fertility program
- **Menstrual cycle history** (dates, length, regularity) — what Mariposa already has
- Documentation of response to **prior fertility meds** (e.g. letrozole, Clomid cycles)
- Prior **lab results**: FSH, AMH, TSH, prolactin, estradiol
- Prior **semen analysis** results (male partner)
- Any **HSG** (hysterosalpingogram) report/film and **ultrasound** reports
- List of current medications and supplements
- Referral from PCP/OB-GYN, if the plan requires one
- A written list of questions

Sources: [Univ. of Michigan — what to bring](http://medicine.umich.edu/dept/crm/patient-resources/what-bring-your-appointment),
[Genesis Fertility — planning your visit](https://www.genesisfertility.com/getting-started/planning-your-visit/),
[Mount Sinai Fertility — first appointment checklist](https://mountsinaifertility.com/becoming-a-patient/first-appointment-checklist/).
Content rephrased for compliance with licensing restrictions.

## What happens at the first visit (real)
- Lasts ~30–60 minutes; review of both partners' medical and reproductive history.
- Both partners are evaluated — female workup (labs, ultrasound, possibly HSG) and male
  semen analysis. Male-factor contributes ~half of cases, so the male partner is part of the
  workup from the start.
- Clinic financial counselor often verifies benefits before testing begins.

## Questions to ask the clinic on a booking call (real)
1. Are you accepting new patients, and what is the earliest consult slot?
2. Do you evaluate **both partners**, and can male testing be ordered early?
3. Do you accept our insurance / are you in-network?
4. What should we **bring** to the first visit?
5. Can billing provide **CPT codes** before booking so we can verify coverage?
6. Is a **referral** required?
7. Do you offer virtual/telehealth first consults?

Sources: [5 questions for first appointment](https://pozitivf.com/blog-questions-to-ask-first-fertility-appointment/),
[Inovi Fertility — first consultation](https://www.inovifertility.com/blog/first-fertility-consultation/).
Content rephrased for compliance.

## Sample clinic for the demo (FICTIONAL)

```
name:        "Bay Area Fertility & Reproductive Health" (fictional)
type:        Reproductive Endocrinology (REI) clinic
location:    San Francisco, CA
phone:       (555) 010-2025          (fake placeholder)
in_network:  Pacific Crest Health PPO  (matches seed couple plan)
new_patients: yes
both_partner_eval: yes
telehealth_first_visit: available
bring_list: ID, insurance card, cycle history, prior meds, semen analysis, any labs
```

### Sample available slots (for the booking-call demo)
- Tue, Jun 23, 2026 — 10:30 AM (virtual)
- Thu, Jun 25, 2026 — 2:00 PM (in person)
- Mon, Jun 29, 2026 — 9:00 AM (in person)

### What the simulated booking call produces
- Booked: **Thu, Jun 25, 2026, 2:00 PM** consult (calendar_event).
- Tasks created: her → gather cycle history + bring AMH result; him → bring semen analysis,
  request urology note; together → confirm insurance card + complete intake forms.
- Doctor summary updated with appointment + the bring-list.
