## To run

**Docker (sample data included):**
```sh
docker compose up            # http://localhost:3001 (seeds sample data on first start only)
EMPTY_DB=1 docker compose up # first start seeds game templates but no sample events
```
Restarts never re-seed (user data and event ids survive; QR links stay valid). To reset: `docker compose down && docker compose up --build`. `EMPTY_DB` must be exactly `1`.

**Locally (Node 22, tested):**
```sh
npm install
npm run seed   # sample data incl. a nearly-full event; re-running resets ALL data (ids change)
npm run dev    # client http://localhost:5173, API :3001
```

Tests: `npm test` (67 unit/API tests) · `npx playwright test` (golden-path e2e; needs ports 3001/5173 free).

## Design

How did you determine and enforce how many people can attend an event? Where does capacity live, and what happens under concurrent registrations for the last seat? - I explicitly designed the data to have an event and registration table with capacity being a property of event and eventId being a FK on regstration. Since I'm using a synchronous sql-lite library, the POST handler on /registrations which runs an INSERT with a WHERE that re-counts inside the same write, it's got an atomic capacity check. If that fails an EVENT_FULL is returned.

How does your template system work, and what would adding a 4th game (or a non-card game) require? - Since the 3 ccgs I analysed during the requirements gathering phase, all use swiss scheduling, or just custom(arbitrary game time) to create their tournaments, I have a Schedule, which is either Custom or Swiss and the Swiss table has props that can set all permutations of a Swiss schedule(roundTimerMinutes,overtimeSlackMinutes,preEventTimeMinutes, breakTimeMinutes) and each format uses a Schedule. This allows for the addition of more props to SwissSchedule in the future. This also allows for the addition of another Schedule type, while keeping the data model consistent. I verified it by reviewing the tournamnet format of the next 2 most popular CCGs

What did you deliberately cut or fake to stay in the timebox, and what would you build next? - Cut: localizable strings through something like i8n, inlined strings hurt my eyes professionally, but I was cognizant of the time box. I thought I had the time to add UI and handling of custom Formats, the data supports it, but I ran out of time. However, if I was continuing this as a POC, the next thing to add would be cancellations(explicitly called out as no in the instructions, explaining why cut is different from next)

## AI usage

AI first approach, which I think is both expected and I did the right way. Plan first approach: for each step generate a detailed plan, verify and modify it until I'm satisfied with it's correctness, only then execute. One thing that I was very happy with is the result of using different models simultaniously for adversarial review. At Microsoft, I always used models from all providers to do adversarial review, because they would often catch things the others missed. Right now I only have a Claude subscription, so I could only have Opus and Fable have a simultanious go, but I was very pleasantly surprised at how many things Opus caught that Fable missed and I went through 3 rounds of adversarial review until I was satisfied. Everything is logged, a summary in ai_usage.md and everything in ai_usage_raw.md. I specifically had the summary highlight push-back from me, but if you want 1 example: during the "requirements gathering" phase(I had no idea how MTG tournaments worked, I applied for this position because I'm a D&D fan), the agent was trying to over-simplify tournament rules and I pushed back until I was sure I understood the "spec" and could design a template that would cover all cases.
