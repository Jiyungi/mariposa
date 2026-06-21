# Cycle, Ovulation & Trying-Window Reference

Real clinical guidance for the fertile-window math (F3), missing-data rules (F4), and the
trying-duration trigger the agent uses (F7).

## Ovulation & fertile window (cited guidance)

- Ovulation occurs roughly **14 days before the next period**, regardless of cycle length.
  Source: [ACOG — when to have sex](https://www.acog.org/womens-health/experts-and-stories/the-latest/trying-to-get-pregnant-heres-when-to-have-sex).
- The **fertile window** is about a **6-day interval ending on the day of ovulation**.
  Intercourse every 1–2 days in that window gives the highest chance.
  Source: [ASRM — Optimizing Natural Fertility](https://www.reproductivefacts.org/news-and-publications/fact-sheets-and-infographics/optimizing-natural-fertility).
- Peak fertility is around **days 12–14 of an average 28-day cycle**.
  Source: [NICHD ovulation](https://www.nichd.nih.gov/newsroom/digital-media/infographics/ovulation-textalt).
- About **80% of couples conceive within the first 6 months** of trying.
  Source: [ASRM](https://www.asrm.org/practice-guidance/practice-committee-documents/optimizing-natural-fertility-a-committee-opinion-2021).

Content rephrased for compliance with licensing restrictions.

## When to seek evaluation (the agent's trigger rule — F7)

- Under 35: evaluate after **12 months** of trying without conceiving.
- 35 or older: evaluate after **6 months**.
- Sooner if there are red flags (irregular/absent periods, known PCOS/endometriosis, prior
  pelvic surgery, known male factor).

Source: [ASRM/ACOG fertility evaluation timing](https://www.asrm.org/practice-guidance/practice-committee-documents/fertility-evaluation-of-infertile-women-a-committee-opinion-2021/),
[ACOG evaluating infertility](http://www.acog.org/Patients/FAQs/Evaluating-Infertility).
Content rephrased for compliance.

## Cycle regularity reference

| Category | Cycle length |
| --- | --- |
| Regular | ~24–38 days, consistent month to month |
| Irregular | varies > 7–9 days between cycles, or outside 24–38 |
| The seed couple (her) | 45–60 days, irregular, ovulation not confirmed |

## Trying-window math (the F3 algorithm — irregular path)

For an irregular cycle with a min/max length, compute a **wide** window and label confidence Low:

```
minOvulation     = lastPeriodStart + cycleLengthMin - 14
maxOvulation     = lastPeriodStart + cycleLengthMax - 14
fertileWindowStart = minOvulation - 5
fertileWindowEnd   = maxOvulation + 1
```

Confidence is **Low** when: cycle is irregular, ovulation is not confirmed (no progesterone /
no LH confirmation), and the cycle range is wide.

### Worked example (seed couple)
- lastPeriodStart = **2026-06-01**, cycleLengthMin = **45**, cycleLengthMax = **60**.
- minOvulation = Jun 1 + 45 − 14 = **Jul 2**
- maxOvulation = Jun 1 + 60 − 14 = **Jul 17**
- fertileWindowStart = Jul 2 − 5 = **Jun 27**
- fertileWindowEnd = Jul 17 + 1 = **Jul 18**

**Expected app output:** Estimated trying window **June 27 – July 18, 2026**; priority days
**July 2 – July 17, 2026**; confidence **Low**; reasons: irregular cycle, ovulation not
confirmed, wide cycle range.

> Note: the luteal phase = 14 days assumption is a simplification flagged as a reason the
> confidence is Low. This is a rule-based estimate, not a clinical algorithm.

## Important boundary (keep the "for couples" story honest)
Male data (semen analysis, lifestyle) must **NOT** change ovulation timing. It only affects
readiness, tasks, missing-data flags, and doctor questions.
