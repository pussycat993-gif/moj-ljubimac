# Product Brief — Moj Ljubimac (Web)

## Document Control

| Field | Value |
|---|---|
| Product | Moj Ljubimac ("My Pet") — web application |
| Document | 01 — Product Brief |
| Version | 1.7 |
| Date | 2026-10-19 |
| Author | Keti Vrtunić (interview facilitated by "Đura", Senior PM persona) |
| Status | Draft — awaiting owner review |

**Change log**

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-10-19 | Initial brief. Fresh start: all prior web documentation is non-binding. Web is the sole and permanent product channel. |
| 1.1 | 2026-10-19 | OQ-02 resolved: email reminders free for all; WhatsApp and Viber delivery Premium-only. |
| 1.2 | 2026-10-19 | Change requests from PRD interview: push notifications added as a free delivery channel (CAP-03); grooming salons added as a third partner type (CAP-07). |
| 1.3 | 2026-10-19 | CAP-07 quick actions redefined: call, send message, send email, visit website (no "order" action). Operator admin area made explicit. |
| 1.4 | 2026-10-19 | OQ-05 resolved: v1 interface in Serbian (Latin script) and English. |
| 1.5 | 2026-10-19 | Change requests from Technical Constraints: Viber delivery is built but switched on only once Premium revenue covers its fixed monthly cost; public launch waits for a registered business and a domestic card-processing contract. |
| 1.6 | 2026-10-19 | Pet hotels / pet boarding added as a fourth partner type (CAP-07). |
| 1.7 | 2026-10-19 | New capability CAP-08 "Šapa pomoći" (community listings: shelter needs with donation info, giving, selling, seeking; 1:1 messaging; report, block, Operator moderation). Persona P6, ASM-10, RISK-29 and RISK-30, glossary terms added; scope warning updated to eight themes. |

---

## 1. Executive Summary

Moj Ljubimac is a Serbian- and English-language web application that keeps a pet's complete health record in one place and makes sure owners never miss a vaccination, medication dose, or vet check-up, by delivering reminders through the channels they already use: email, push notifications, WhatsApp, and Viber. It serves dog and cat owners and their households first, and also gives animal shelters (free) and breeders (paid) a way to manage many animals, adoptions, and litters. Local vet clinics, pet shops, grooming salons, and pet hotels can promote themselves inside the product with one-tap contact actions (call, message, email, website), creating a second revenue stream alongside Premium subscriptions. A community board, "Šapa pomoći" ("Helping Paw"), lets shelters post what they need and lets anyone give away, sell, or look for pet items and talk to each other directly, with no money passing through the product. The product ships on the web only, because it must reach users without the cost of mobile app store distribution, and it is designed to stand on its own permanently rather than as a stopgap. Success is measured by how many pets actively receive reminders each month.

---

## 2. Problem Statement

Pet owners in Serbia have no single, reliable place to keep their pet's health history, and they routinely miss time-sensitive care. `[Assumption]`

- **Records are fragmented and fragile.** The health booklet issued by the vet is paper; it gets lost, damaged, or is at home when it is needed (at a new vet, a groomer, a border crossing, or a pet sitter's). `[Assumption]`
- **Reminders depend on someone else's memory.** Owners rely on their vet to call or text them, on their own phone calendar or notes, or simply on remembering, and revaccinations and medication doses are regularly forgotten. `[Assumption]`
- **Care is shared but information is not.** Several household members feed, walk, medicate, and take the pet to the vet, but each holds only part of the picture. `[Assumption]`
- **Organisations with many animals have the same problem at scale.** Shelters must track the health of dozens of animals and the adoption process; breeders must track litters, puppy/kitten health, and hand-over to new owners. Today this is done on paper or ad-hoc spreadsheets. `[Assumption]`
- **Local vets and pet shops lack a direct, timely channel to owners** at the moment a need arises (a due vaccination, running out of food). `[Assumption]`

**Cost if unsolved:** missed vaccinations and doses with health consequences for the animal, repeated or lost paperwork, friction at every vet visit, and lost business for local providers. `[Assumption]`

**Evidence status:** no formal user research yet. All claims above are founder assumptions to be validated (see §11).

---

## 3. Current State & Alternatives

What people do today instead, all of which are in use simultaneously:

1. **Paper vet booklet** — the official record, but single-copy and easily lost or left at home.
2. **Vet-initiated reminders** — calls or SMS from the clinic; inconsistent and clinic-dependent.
3. **Personal phone calendar or notes** — self-managed, not shared with the household, no health history.
4. **Memory** — "we'll remember"; frequently fails for revaccinations and medication schedules.

Shelters and breeders additionally use paper files and spreadsheets. `[Assumption]`

---

## 4. Target Users & Personas

### Primary — P1: Pet Owner
- **Context:** Lives in Serbia, owns one or more dogs and/or cats (both species roughly equally), has a regular vet, communicates daily via Viber/WhatsApp.
- **Jobs-to-be-done:** Keep the pet's health history at hand; be reminded on time about vaccines, treatments, check-ups, and medication; share care duties with the household; show the record to a vet.
- **Pains:** Lost booklet, forgotten revaccinations and doses, nobody in the house knows what the other did.
- **Gains:** Peace of mind, one complete record, reminders that actually arrive where they look.

### Secondary — P2: Household Member
- **Context:** Partner, parent, child, or flatmate who shares care of the pet.
- **Jobs-to-be-done:** See and update the same record, receive the same reminders, log what they did.

### Secondary — P3: Animal Shelter (free)
- **Context:** Organisation caring for many animals at once, with limited budget and volunteer staff.
- **Jobs-to-be-done:** Track health of every animal, manage the adoption process from intake to placement.
- **Pains:** Paper files, volunteers without shared information, records lost at adoption.

### Secondary — P4: Breeder (paid)
- **Context:** Professional or hobby breeder of dogs or cats managing breeding animals and litters.
- **Jobs-to-be-done:** Track breeding animals and litters, record the health of each puppy/kitten, hand over a proper record to the new owner.

### Business customer — P5: Partner (vet clinic, pet shop, grooming salon, or pet hotel)
- **Context:** Local business that wants to reach pet owners near them.
- **Jobs-to-be-done:** Be visible to owners at the moment of need; receive calls, messages, and website visits.
- **Note:** Partners are paying customers, not record-keeping users. In v1 they are onboarded and billed by the operator, not through the product.

### Secondary — P6: Community Member (Šapa pomoći)
- **Context:** Any signed-in user — owner, household member, breeder, or shelter staff — with spare pet items to give away or sell, or looking for something; shelters additionally post what they need. Visitors who are not signed in can browse listings.
- **Jobs-to-be-done:** Give away or sell food, equipment, and furniture the pet no longer uses; find an item cheaply; help a shelter with exactly what it needs; agree the details with the other person without sharing a phone number.
- **Pains:** Scattered Facebook groups and classifieds, posts that go stale, shelters' needs lost in feeds, exposure of personal contact details to strangers.

### Anti-persona — explicitly not for
- **Veterinary clinics looking for practice-management software** (patient records for all clients, appointment books, invoicing). Moj Ljubimac is the owner's record, not the clinic's system.
- **Anyone seeking veterinary diagnosis or medical advice.** The product records and reminds; it does not advise on treatment.
- **Pet businesses looking for inventory, point-of-sale, or e-commerce tools.**

---

## 5. Value Proposition

For dog and cat owners in Serbia who keep losing track of their pet's health care, **Moj Ljubimac** is a pet health record in the browser that keeps the full history in one place and delivers reminders on email, WhatsApp, or Viber, shared with everyone in the household. Unlike the paper vet booklet or a personal calendar, it cannot be lost, is always up to date for the whole family, and reaches owners where they already communicate, with no app download required. Its "Šapa pomoći" board turns the same community into a place where shelters' needs are met and spare pet items find a new home.

---

## 6. Differentiation & Competitive Landscape

| Alternative | Weakness | How Moj Ljubimac wins |
|---|---|---|
| Paper vet booklet | Single copy, lost, not at hand | Always available, exportable for the vet |
| Vet reminders (call/SMS) | Inconsistent, one clinic only | Owner-controlled, covers every type of care |
| Phone calendar / notes | No health history, not shared | Full record + shared household view |
| International pet-health apps | English-first, store-only, no local providers | Serbian-first, works in any browser, local vets and pet shops, Viber/WhatsApp delivery |
| Spreadsheets (shelters, breeders) | Manual, not shareable with adopters/buyers | Multi-animal accounts with adoption and litter tracking |
| Facebook groups / general classifieds | Posts go stale, shelter needs get buried, contact details exposed | Pet-only listings that expire after 30 days, shelter needs with donation info, in-app messaging without sharing phone or email |

**Positioning:** the local, Serbian-language pet health record that reaches people on the messaging apps they already use, with no store download required, and that connects owners, shelters, breeders, and local providers in one place.

---

## 7. Product Vision

Over 1–3 years, Moj Ljubimac becomes the default pet health record in Serbia: every new pet, whether adopted from a shelter, bought from a breeder, or registered by an owner, starts life with a record that follows it from home to home. Local vets and pet shops across the country use it as their direct channel to nearby owners. The web product remains the core channel permanently; native store apps may be revisited only if budget allows, and are not a dependency of this vision.

---

## 8. Goals & Success Metrics

### North-star metric
**Active reminded pets:** number of pets that had at least one reminder successfully delivered (email, WhatsApp, or Viber) in the trailing 30 days.
- **Target:** 300 active reminded pets by 6 months after public launch `[Assumption — proposed target, see OQ-01]`
- **Measurement:** counted monthly from the product's own record of delivered reminders.
- **Why this metric:** it proves the product is doing its core job (keeping care on time), not just collecting sign-ups.

### Business goals

| Goal | Target | Deadline | Measurement |
|---|---|---|---|
| Registered owner accounts | 500 accounts | 6 months after launch | Count of verified accounts |
| Paid Premium subscriptions (owners + breeders) | 25 active subscriptions | 6 months after launch | Count of active paid subscriptions at month end |
| Paying partners (vets / pet shops / grooming salons / pet hotels) | 5 active partners `[Assumption — proposed, see OQ-01]` | 6 months after launch | Operator's partner billing records |
| Running costs within budget | ≤ €20 per month | Every month from launch | Monthly service invoices |

### User goals

| Goal | Target | Deadline | Measurement |
|---|---|---|---|
| Reminders reach the user | ≥ 95% of scheduled reminders delivered | Monthly, from launch | Delivered ÷ scheduled reminders |
| Owners keep a complete record | ≥ 60% of active pets have at least one vaccination entry `[Assumption — proposed]` | 6 months after launch | Share of active pets with ≥ 1 vaccination record |
| Shelters adopt the product | 3 active shelter accounts `[Assumption — proposed, see OQ-01]` | 6 months after launch | Count of shelter accounts with activity in last 30 days |

---

## 9. Scope — In Scope (v1)

v1 contains eight capability themes. Each is a candidate EPIC for the PRD.

- **CAP-01 — Pet Health Record.** Pet profile, vaccinations, treatments/therapies, vet visits with attachments, weight history, birthday, and export of the full record as a shareable document for the vet.
- **CAP-02 — Care Log & Moments.** Daily nutrition and stool log; "moments" (photos and notes from the pet's life) and sharing them outside the product.
- **CAP-03 — Reminders & Multi-Channel Delivery.** Reminders for vaccinations, treatments, medication doses, check-ups, and birthdays, delivered by email or push notification (all users) or WhatsApp / Viber (Premium only), according to the user's choice.
- **CAP-04 — Household Sharing.** Inviting household members so that everyone sees and updates the same record and receives the same reminders.
- **CAP-05 — Accounts, Subscriptions & Data Control.** Registration and sign-in; Free tier (one pet) and paid Premium; user control over personal data, including account deletion.
- **CAP-06 — Multi-Animal Organisation Accounts.** Shelter accounts (free) with animal intake, health tracking, and the full adoption process; breeder accounts (paid) with breeding animals, litter records, and per-animal health tracking.
- **CAP-07 — Local Partners.** Vet clinics, pet shops, grooming salons, and pet hotels (boarding) listed near the user with one-tap "call", "send message", "send email", and "visit website" actions as paid promotion, including featured placement. Partners are added and billed manually by the operator through an operator admin area, which is also used to approve shelter accounts.
- **CAP-08 — Šapa pomoći (Helping Paw).** A community board of listings in four types: shelter needs ("Potreba", with a "Doniraj" button that shows the shelter's donation info — bank account and/or payment link, drop-off address and hours), giving away ("Poklanjam"), selling ("Prodajem", price in RSD or "po dogovoru"), and seeking ("Tražim"). Listings have fixed categories, species, city, and up to 5 photos; they are public to browse without sign-in and expire after 30 days unless extended. Free users may have 3 active listings; Premium users and shelters are unlimited. Signed-in users talk 1:1 about a listing through in-app messaging with email and push notification, can report and block other users, and the Operator moderates reports. Money never passes through the product.

> ⚠️ **Scope warning:** eight themes across three user segments plus a B2B partner programme is at the upper limit for a v1 built by a single person. The owner has consciously accepted this (see RISK-01). Delivery order within v1 is to be decided in the Build Plan.

---

## 10. Scope — Out of Scope (v1)

| Excluded | Rationale |
|---|---|
| Native apps in Google Play / App Store | No budget for store fees; web is the permanent channel. |
| AI food scanning | Previously built and deliberately removed by product decision. |
| Self-service partner portal and in-product partner billing | Premature; partners are few at launch and are handled manually by the operator. |
| Veterinary practice-management features | Different product for a different customer (see anti-persona). |
| Medical diagnosis or treatment advice | Liability; the product records and reminds, it does not advise. |
| Money handling for Šapa pomoći (donations, sale payments, escrow, delivery) | Payment and liability burden; donations and sales are settled directly between people, outside the product (CAP-08). |

---

## 11. Key Assumptions

| ID | Assumption | How to validate |
|---|---|---|
| ASM-01 | Owners lose or forget the paper booklet and miss revaccinations/doses often enough to want a tool. | Short survey in pet Facebook groups and at partner vets; track reminder opt-in rate. |
| ASM-02 | Owners will register and return to a web product without installing an app. | 30-day return rate of new accounts. |
| ASM-03 | Viber/WhatsApp reminders are preferred over email. | Channel choice distribution among active users. |
| ASM-04 | Owners will pay for Premium on the web. | Free-to-Premium conversion in first 3 months. |
| ASM-05 | Shelters will adopt a free tool and use it for adoptions. | Number of active shelter accounts; adoptions recorded. |
| ASM-06 | Breeders will pay for litter and multi-animal tracking. | Paid breeder accounts in first 6 months. |
| ASM-07 | Local vets and pet shops will pay for promotion inside the product. | Partner pilot conversations before launch; paying partners at 6 months. |
| ASM-08 | Messaging costs at target scale fit within €20/month. | Monthly cost tracking against delivered-reminder volume. |
| ASM-09 | The proposed metric targets (OQ-01) are realistic for a solo, unpromoted launch. | Review at month 3. |
| ASM-10 | Owners and shelters will use Šapa pomoći to give, sell, seek, and donate instead of (or alongside) Facebook groups. | Active listings, listings marked resolved, and conversations started per month from month 1. |

---

## 12. Risks

| ID | Risk | Type | Severity | Mitigation idea |
|---|---|---|---|---|
| RISK-01 | v1 scope (8 capabilities, 3 segments + partners + community board) is too large for one builder; launch slips indefinitely. | Business | High | Build Plan sequences v1 in waves; public launch may start once the owner-facing core is ready. |
| RISK-02 | WhatsApp/Viber messaging costs exceed €20/month as usage grows. | Business | High | Email is the free channel for everyone; WhatsApp and Viber delivery is Premium-only, so messaging cost scales with paying users. |
| RISK-03 | A website has weaker presence than an installed app; users forget to return. | Product | High | Reminders are the return mechanism; encourage saving the site to the phone's home screen. |
| RISK-04 | Partner programme hits a cold start: partners won't pay without users. | Market | Medium | Offer early partners free or discounted placement until user targets are met. |
| RISK-05 | Personal data handling (owners, household members, adopters, buyers) must comply with Serbian personal data protection law; messaging platforms require user consent and impose business-messaging rules. | Regulatory | Medium | Legal check of privacy terms and consent flows before launch; account deletion included in CAP-05. |
| RISK-06 | Users treat records or reminders as medical advice; a missed or wrong reminder causes harm. | Regulatory | Medium | Clear terms that the product is a record-keeping aid; owner remains responsible for care decisions. |
| RISK-07 | Single-person operation: support, partner sales, and development all depend on one person. | Business | Medium | Keep partner onboarding manual and lightweight; self-help content for users. |
| RISK-29 | Šapa pomoći moderation load (reports, spam, inappropriate listings) exceeds what one Operator can handle. | Product | Medium | Fixed categories, 30-day expiry, Free limit of 3 active listings, user-side blocking, and a single reports queue; listings can be hidden in one action. |
| RISK-30 | Scams or fraud between users (fake shelter needs, prepayment for items never sent) damage trust in the product. | Regulatory | Medium | Needs only from Operator-approved shelters; money never passes through the product; report reason "scam"; Operator can suspend a user from Šapa pomoći; safety tips on listing pages. |

---

## 13. Constraints

- **Channel:** web only. No mobile app store distribution in v1 or as a dependency of later phases.
- **Team:** one person (the owner) designs, builds, operates, sells to partners, and supports users.
- **Timeline:** no fixed deadline.
- **Budget:** running costs up to approximately €20 per month. Viber delivery carries a fixed monthly fee far above this budget, so it is switched on only once Premium revenue covers it.
- **Payments:** subscriptions are charged through a domestic Serbian card processor; this requires a registered business and a bank contract, and the public launch waits for both.
- **Market and language:** Serbia; interface in Serbian (Latin script) and English from v1.
- **Legal:** must comply with Serbian personal data protection law and with messaging platform consent rules; users must be able to delete their account and data.

---

## 14. Stakeholders & Decision Rights

| Stakeholder | Role |
|---|---|
| Keti Vrtunić (owner) | Decides and approves everything: scope, pricing, partners, priorities. |
| Partners (vet clinics, pet shops) | Informed and consulted on promotion format; no decision rights. |
| Shelter and breeder pilot users | Consulted for feedback; no decision rights. |

---

## 15. Glossary

| Term | Definition |
|---|---|
| Pet Health Record | The complete history of one animal: profile, vaccinations, treatments, vet visits, weight, attachments. |
| Vet booklet | The paper health booklet issued by a veterinarian; the status-quo record. |
| Care Log | Daily entries about nutrition and stool. |
| Moment | A photo or note capturing an event in the pet's life, shareable outside the product. |
| Reminder | A scheduled notice about upcoming care (vaccination, treatment, dose, check-up, birthday). |
| Delivery channel | The way a reminder reaches the user: email or push notification (all users), WhatsApp or Viber (Premium). |
| Household | A group of people who share access to the same pets' records and reminders. |
| Free tier | No-cost plan limited to one pet. |
| Premium | Paid subscription unlocking features beyond the Free tier. |
| Organisation account | An account that manages many animals: a Shelter account or a Breeder account. |
| Shelter account | Free organisation account for animal shelters, including intake and adoption tracking. |
| Breeder account | Paid organisation account for breeders, including breeding animals and litters. |
| Adoption process | The steps from a shelter animal's intake to its placement with a new owner. |
| Litter | A group of puppies or kittens born together, tracked under a Breeder account. |
| Partner | A vet clinic, pet shop, grooming salon, or pet hotel (boarding) paying for promotion inside the product. |
| Quick action | One-tap "call", "send message", "send email", or "visit website" button connecting an owner to a Partner. |
| Operator | The person running the product (the owner), who manages partners manually in v1. |
| Active reminded pet | A pet with at least one reminder delivered in the trailing 30 days; the north-star unit. |
| Šapa pomoći | "Helping Paw" — the community board of listings and messaging (CAP-08). |
| Listing | A post on Šapa pomoći of type need, giving, selling, or seeking; active for 30 days unless extended or resolved. |
| Need | A listing type ("Potreba") that only approved shelters may post, describing what the shelter needs; carries a "Doniraj" button. |
| Donation info | A shelter's bank account and/or payment link, drop-off address, and drop-off hours, shown by "Doniraj"; donations happen outside the product. |
| Conversation | A 1:1 text message thread between a listing's author and one interested signed-in user, tied to that listing. |
| Report | A user's flag on a listing or user, with a reason, reviewed by the Operator. |
| Block | A user's choice to stop another user from messaging them and to hide that user's listings from them. |

---

## 16. Open Questions

| ID | Question | Owner | Blocking for PRD? |
|---|---|---|---|
| OQ-01 | `[NEEDS CLARIFICATION]` Confirm proposed targets: 300 active reminded pets, 5 paying partners, 3 active shelters, 60% of pets with a vaccination entry — all at 6 months. | Keti | No |
| OQ-02 | ✅ Resolved (v1.1): email free for all; WhatsApp and Viber Premium-only. | Keti | — |
| OQ-03 | `[NEEDS CLARIFICATION]` Final Premium pricing for owners and pricing for Breeder accounts (earlier 399 / 2,990 RSD were trial figures). | Keti | No |
| OQ-04 | `[NEEDS CLARIFICATION]` Partner promotion pricing and placement rules (e.g., by distance, by city). | Keti | No |
| OQ-05 | ✅ Resolved (v1.4): Serbian (Latin script) and English from v1. | Keti | — |

---

## 17. Appendix

_None for v1._
