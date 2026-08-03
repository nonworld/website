# Privacy policy — DRAFT for legal review

**Status: draft. Not legal advice, and not for publishing as-is.**

This was written to unblock task #14 (logging NON Somm queries), because nothing
can be logged until the policy says it is. It covers what the site and the Somm
actually do today, verified against the code rather than assumed. It still needs
a lawyer's eye before it goes live — particularly the retention periods, which
are proposals, and the rights sections, which depend on where NON is deemed to
be established for GDPR purposes.

Fields marked **[CONFIRM]** are ones I could not verify and should not guess.

---

## Privacy Policy

NON Australia Pty Ltd **[CONFIRM: legal entity name and ACN]** ("NON", "we")
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
Anthropic processes it as our supplier under contract and does not use it to
train its models **[CONFIRM: current Anthropic commercial terms]**.

**What we keep.** We retain Somm questions and the answers given, so we can
see where the Somm is wrong, unhelpful, or missing information, and improve it.
Retained records include the question, the answer, the page, and a timestamp.
They are held in a NON-controlled database and exported to a restricted NON
Google Drive folder for review by NON staff only.

**What we do not do.** We do not link Somm queries to your identity, use them
for advertising, sell them, or share them with anyone outside NON and the
suppliers named above.

**Retention.** Somm records are kept for **[CONFIRM: proposed 24 months]**,
then deleted.

**Please do not type personal or sensitive information into the Somm.** It is
a drinks assistant. It does not need your name, address, payment details, or
any health information, and you should not give it any. If you do, it will be
retained as described above until deleted. To have a Somm query removed, email
privacy@non.world **[CONFIRM: this address exists]** with the approximate date
and what you asked.

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
stop using it for marketing. Email **[CONFIRM: privacy@non.world]** and we will
respond within 30 days.

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
**[CONFIRM: privacy@non.world]**, or NON, 79 Taunton Dr, Cheltenham VIC 3192,
Australia.

---

## Notes for Aaron, not for publishing

1. **The Somm section is the load-bearing one.** Task #14 is blocked purely
   because there was no published basis for retaining queries. The wording
   above is deliberately specific — what is sent, to whom, how long, and that
   it is not linked to identity — because a vague line would not actually
   unblock it.

2. **Six [CONFIRM] items** need answers before publishing: the legal entity and
   ACN, whether privacy@non.world exists, the Anthropic training-data terms as
   they stand in your contract, and the two retention periods.

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
