# Privacy policy — DRAFT for legal review

**Status: draft. Not legal advice, and not for publishing as-is.**

This was written to unblock task #14 (logging NON Somm queries), because nothing
can be logged until the policy says it is. It covers what the site and the Somm
actually do today, verified against the code rather than assumed. It still needs
a lawyer's eye before it goes live — particularly the retention periods, which
are proposals, and the rights sections, which depend on where NON is deemed to
be established for GDPR purposes.

All [CONFIRM] fields are now answered. Two were resolved from records rather
than by asking — see the notes at the end for which, and why one of them still
wants a glance from you.

---

## Privacy Policy

NON Australia Pty Ltd (ACN 630 918 802, ABN 68 630 918 802) ("NON", "we")
operates non.world. This policy explains what we collect, why, and what you can
ask us to do about it.

Last updated: **[DATE ON PUBLISH]**

### What we collect

**When you buy something.** Name, email, delivery and billing address, phone
number if you give one, and your order history. Payment card details are
handled by Shopify and its payment providers and never reach us — we see only
the last four digits and the card type.

**When you contact us.** The name, email, subject and message you submit
through the contact form, which is delivered to hello@non.world.

**When you subscribe.** Your email address, and whether you have opened or
clicked our emails.

**When you browse.** Pages visited, referring site, approximate location
derived from IP address, device and browser type. This comes through Shopify's
own analytics and Google Tag Manager.

**When you use NON Somm.** See the section below, which is the part of this
policy most worth reading.

### NON Somm

NON Somm is the pairing and product assistant on this site. It answers in your
own words rather than from a fixed list, which means what you type is sent
somewhere to be answered.

**What is sent.** The question you type, the page you are on, and — on a
product page — which bottle you are viewing. Nothing else. We do not attach
your name, email, account or order history to a Somm query, and the Somm is
never given your personal details.

**Where it goes.** Your question is sent to a NON-operated service running on
Cloudflare Workers, which passes it to Anthropic's API to compose the answer.
Anthropic processes it as our supplier under contract. Under Anthropic's
Commercial Terms of Service, which govern our API use, Anthropic does not train
its models on inputs or outputs from the API.

**What we keep.** We retain Somm questions and the answers given, so we can
see where the Somm is wrong, unhelpful, or missing information, and improve it.
Retained records include the question, the answer, the page, and a timestamp.
They are held in a NON-controlled database and exported to a restricted NON
Google Drive folder for review by NON staff only.

**What we do not do.** We do not link Somm queries to your identity, use them
for advertising, sell them, or share them with anyone outside NON and the
suppliers named above.

**Retention.** Somm records are kept for 24 months, then deleted.

**Please do not type personal or sensitive information into the Somm.** It is
a drinks assistant. It does not need your name, address, payment details, or
any health information, and you should not give it any. If you do, it will be
retained as described above until deleted. To have a Somm query removed, email
hello@non.world with the approximate date and what you asked.

**Health questions.** The Somm can tell you that every NON bottle is 0.0% ABV
and what is in it. It is not qualified to give medical, pregnancy, medication
or driving advice and is instructed to refer you to a doctor or the relevant
authority. Do not rely on it for those.

### Who else handles your data

| Who | What for |
|---|---|
| Shopify | The store, checkout, orders, customer accounts, analytics |
| Cloudflare | Hosting the Somm service and its records |
| Anthropic | Composing Somm answers |
| Klaviyo | Marketing email, if you have subscribed |
| Google | Tag Manager and analytics; the Drive folder holding Somm reviews |

Each is bound by its own agreement with us. Several are outside Australia, so
your information may be processed overseas — principally in the United States.

### Cookies

We use cookies that are necessary for the cart and checkout to work, and
analytics cookies that tell us how the site is used. You can refuse
non-essential cookies through the banner or your browser settings; the store
will still work.

### Your rights

You can ask us to show you what we hold about you, correct it, delete it, or
stop using it for marketing. Email hello@non.world and we will respond within
30 days.

If you are in the UK or EU, you also have the right to object to processing,
request portability, and complain to your local supervisory authority. If you
are in Australia, you may complain to the Office of the Australian Information
Commissioner. If you are in California, you may request disclosure or deletion
and we will not discriminate against you for asking.

### Security and children

We hold your information on services with access controls and encryption in
transit. No system is perfect, and we will tell you and the relevant regulator
if a breach affects you.

This site sells drinks intended for adults. It is not directed at children and
we do not knowingly collect their information.

### Changes and contact

We will post any change here and update the date above. Questions:
hello@non.world, or NON, 79 Taunton Dr, Cheltenham VIC 3192, Australia.

---

## Notes for Aaron, not for publishing

1. **The Somm section is the load-bearing one.** Task #14 is blocked purely
   because there was no published basis for retaining queries. The wording
   above is deliberately specific — what is sent, to whom, how long, and that
   it is not linked to identity — because a vague line would not actually
   unblock it.

2. **The [CONFIRM] items are closed.** Answered 2026-08-04:

   - **Legal entity.** NON Australia Pty Ltd. **Taken from Xero, not from you**,
     which reported ABN 68 630 918 802. The ACN above is the last nine digits of
     that ABN — which is how Australian company ABNs are built, and is therefore
     a derivation rather than a reading. It is almost certainly right and it is
     the one number in this document I have not seen stated as itself. Worth ten
     seconds against your ASIC record before a lawyer sees it.
   - **Anthropic training terms.** Stated from Anthropic's published Commercial
     Terms of Service, which is what governs API use. If NON is ever moved onto
     a negotiated agreement, this line has to be re-checked against it.
   - **Retention.** 24 months. Your call.
   - **privacy@non.world.** Does not exist. All three references now point to
     hello@non.world, which the contact form already delivers to. A working
     shared inbox beats a dedicated address nobody reads — but it does mean
     deletion requests land in the same place as trade enquiries, so someone has
     to be watching for them.
   - **Postal address.** Publishing 79 Taunton Dr as-is. Your call.

3. **The "do not type personal information" line matters.** A free-text box
   that gets retained is the highest-risk surface on the site, and saying so
   plainly is both the honest thing and the thing that limits what you have to
   defend later.

4. **Where to publish.** Shopify Settings → Policies has a Privacy policy
   field, which is what the checkout links to. Publishing there is preferable
   to a standalone page, because the checkout link is generated automatically.

5. **This is not legal advice.** I have written what the system does, in plain
   English, which is the part I can verify. Whether it satisfies the Privacy
   Act, GDPR, UK GDPR and CCPA is a question for someone qualified.

---

## What is live today, and the gap that matters

Read back from the store on 2026-08-04. The footer already links PRIVACY POLICY
to `/policies/privacy-policy`, and that resolves to the **stock Shopify
boilerplate**: cookies, log files, web beacons, Order Information, Google
Analytics, behavioural advertising opt-outs, and a Data Retention line that says
order information is kept "unless and until you ask us to delete this
information".

It is a reasonable generic policy for a shop that only sells things. It does not
describe this shop.

**It says nothing about the Somm.** The site takes free text from a customer —
on the homepage, on every product page, and on the pairing page — and sends it
to Anthropic, a third-party processor in the United States. The live policy
discloses Shopify and Google and no one else. A customer reading it today would
have no way to know their question leaves the site at all.

That is the gap, and it is the reason this draft exists. It is also why the
order of operations matters: the Somm is already live and already sending
queries, so the disclosure is overdue independently of task #14's logging.

**Not changed by me.** Replacing the live policy is a legal act, not a content
edit. The [CONFIRM] answers are in; a lawyer still is not. Shopify
Settings → Policies → Privacy policy is the field; the footer link and the
checkout link both follow it automatically, so nothing in the theme needs
touching when it is replaced.
