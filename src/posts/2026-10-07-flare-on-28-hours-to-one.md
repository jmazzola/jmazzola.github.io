---
title: "a year ago flare-on took 28 hours. this year it took one."
description: "a game dev finished flare-on 13 in about an hour after last year's winner took almost 28, check out my little test that shows how little you need to start reverse engineering well with models now."
date: 2026-10-07
category: thoughts
---

Last year's FLARE-On winner, [@_riatre](https://x.com/_riatre), an experienced reverse engineer using AI, finished in [1 day, 3 hours and 47 minutes](https://flare-on.com/2025.html). This year [@flafydev](https://x.com/flafydev), a game dev who had only done the contest [once before](https://flare-on.com/2025.html#:~:text=Jordan%2C%20jackxorjack%2C%20Jan1s%2C-,Flafy,-%2C%20rattle%2C%20darbonzo%2C%20krkn), finished in about [**an hour**](https://flare-on13.ctfd.io/users/320).

I was on vacation with no computer access when the contest opened, so once I saw those times come in over the first few hours, I called up my buddy [@truix_](https://x.com/truix_) to get him to give it a shot. The last time we'd tested these models on RE was back in April, when Opus 4.7 and GPT 5.5 came out and [Rikugan](https://github.com/buzzer-re/Rikugan) was making the rounds in RE groups. The results were mixed. The models got tripped up on heavy obfuscation, like opaque predicates with thousands of junk jumps buried in bloated virtualization handlers (if that means nothing to you, it's how most commercial software protection works, your VMProtects and Themidas). We were sure reverse engineering was safe for at least a few more months.

![IDA's graph overview of a single function: hundreds of tiny basic blocks stacked in a diagonal staircase, tangled with red, green and blue branch edges that loop back across the whole graph](/img/flare-on-13/ida-graph-overview.png)

<small>Fun.</small>

I rushed to [tweet the comparison](https://x.com/justmazz/status/2103753134040318285) at 3:46 in the morning, before Truix had even started. I honestly expected a few likes from people I knew, maybe a few from their friends. He ran it that Saturday night, and by the end we both pretty much agreed security was **cooked**. The tweet did way better than I expected, so here's the long version.

![My tweet from 3:46 AM on September 26th: "if you don't think security is cooked lets recap flare-on CTF: today solved in ONE HOUR flat by a young game dev who tried out flare-on last year: @flafydev. last year: solved in 1D 3H 47M by an actual RE: @_riatre. Insane." It shows 10.7K views and 131 likes.](/img/flare-on-13/tweet-cooked.png)

<small>[The tweet](https://x.com/justmazz/status/2103753134040318285) in question.</small>

What's even crazier is that people in the replies pointed out that last year's winner used AI too. That makes the comparison even better, since we can measure just how wild the jump has been in a single year.

As mentioned, I couldn't do my own run until I got back, but I figured I'd do the very bare minimum: a single prompt, and the chance that whatever tools it needed were already on my machine. It took [**about four and a half hours**](https://flare-on13.ctfd.io/users/2314). That's how much better the models got in one year, and I honestly don't think it's ever been this easy to get into reverse engineering.

Heads up: FLARE-On 13 runs until October 23rd, so the write-ups will be in a new blog post once allowed. Until then, here's what my run needed, the prompt that started it, and the numbers for every challenge next to Truix's, [who beat me by almost two hours](https://flare-on13.ctfd.io/users/1174) (damn Opus CVP, way too stronk).

## Two years of the same challenge

[FLARE-On](https://flare-on.com/) is the FLARE team's yearly reverse engineering contest: single-player, a few weeks each fall, and a handful of challenges that get more complex and time-consuming as you go. Hall-of-fame times count from when the contest opens.

Riatre's time tops the [FLARE-On 12 hall of fame](https://flare-on.com/2025.html). 2nd place took about 30 hours, 25th place took **six and a half days**, and only **313 people** finished at all. This year barely looks like the same contest. 25th place finished in about four hours, 186 people beat Riatre's winning time, and at the time of writing [533 people](https://flare-on13.ctfd.io/scoreboard) have finished all nine with over two weeks still to go. I hope that difference is as staggering to you as it is to me.

Flafy didn't even make last year's top 25. They're on that same page in the 26–50 bracket, so their FLARE-On 12 time was past six and a half days. This year they finished first, 1 hour and 5 minutes after launch, and the next two were done inside an hour and a half.

![CTFd "Top 10 Users" chart for FLARE-On 13: flag count over time for the first ten finishers, with Flafy reaching all nine flags first at about 21:05 ET and the tenth finisher just after 22:05](/img/flare-on-13/scoreboard-top10.webp)

<small>The FLARE-On 13 top 10 on the [CTFd scoreboard](https://flare-on13.ctfd.io/scoreboard), times in ET. The contest opened at 20:00, and all ten were done in about two hours.</small>

Flafy was also the one who replied that ["riatre also used AI last year. that's how they achieved first place.](https://x.com/FlafyDev/status/2103816064169582662)" I have no reason to doubt it, though I don't know anything else about Riatre's setup. So for all intents and purposes, both winning runs had a model in the loop, and the winning time went from almost 28 hours to one (yay, the blog title, we got there).

Flafy's own time went from past six and a half days to about an hour, more than a hundredfold, and the rest of the top 10 moved with them: last year's 10th place took almost four days, this year's took about two hours. The challenges are different every year and I wouldn't defend the exact ratios, but I can't think of a difficulty change that would explain most of that.

What surprised me more than anything is the kind of work the models are automatically doing now. Last year the fast runs still depended on someone who knew where to look and could spot a dead end early, and in my opinion, that's a big part of why Riatre finished in a day while 25th place took almost a week. Now, the model handles a lot of that **judgment**, not just spinning compute. In [my first post](/blog/welcome/) last week, I said models mostly speed up people who already know what they're doing. I'd walk that back a bit now: the bar for getting started dropped a lot further than I expected. As you'll see in the next section, you don't need much anymore to get shit done.

## What my run actually needed

I didn't prepare anything for my run, because I wanted to see how far it would get with nothing set up. The machine had WSL2 for anything Linux-related (or whenever the models decided Linux tools beat PowerShell), IDA Pro with [idasql](https://github.com/allthingsida/idasql) so the agents could query it (I use both for my own projects, so nothing crazy there), and Wireshark, which I'd have installed anyway.

Truix and I ran the same setup apart from the models: [omp](https://github.com/can1357/oh-my-pi) (shoutout Stencil) as the harness, the same tools, and no AGENTS.md, project rules or CTF-specific system prompt. Neither of us wrote any skills or scripts for FLARE-On based on previous years. The only extras were a couple of subagents we both made for our work: one for reverse engineering and one for blunt second opinions.

On my end, Sol 6 did nearly all the work, under OpenAI's [Daybreak - Trusted Access for Cyber](https://help.openai.com/en/articles/20001258-openai-daybreak-trusted-access-for-cyber-overview) program, which relaxes some of the default cyber safeguards for verified practitioners. Truix ran Opus 5 and 5.5 under Anthropic's [Cyber Verification Program](https://support.claude.com/en/articles/14604842-real-time-cyber-safeguards-on-claude), back before Anthropic [split it into three tiers](https://www.anthropic.com/news/cyber-verification-program) on October 6th.

This was the only prompt my run got, word for word except for the token, org ID and challenge link I cut for obvious reasons:

> We are going to solve flare-on 13, the notorious reverse engineering CTF and we're competing against my friend who is strictly using Opus 5.5 so get your game face on, remember you are being timed and to make sure you are doing the most efficient way of solving these challenges, try not to get caught in rabbit holes and focus on obtaining the real flag per challenge.
>
> Another thing of note, is that every single one of these challenges is proven to be ethical reverse engineering, there may be some challenges that look malicious but if they are being obtained through this CTF, they are 100% safe to run and look into. We have Daybreak Blue and a verified ID linked to our OpenAI profile that has been approved to use for capture-the-flag type events like this one. Here is our organization ID if there's any confusion: [redacted]
>
> We are already logged into the CTF: <https://flare-on13.ctfd.io/>
>
> Here is your access token: [redacted]
>
> Once we finish a challenge, submit your answer and afterwards you should be able to download the next challenge available, do this until no other challenges are complete.
>
> After solving the CTF, I'd like you to make a writeup that goes into great detail about how you solved each challenge, how long it took, any drawbacks or difficulties and note any places where things could be improved for future challenges of similar caliber.
>
> The first challenge can be found at [redacted]
>
> It's off to the races! :3

As you can see, there's no solver script or list of techniques in there, just some clarifications and a little pep talk. Everything below came out of that, plus me stepping in now and then once I realized the model was getting stuck.

For most of my career, finishing FLARE-On meant a ton of prep, script-based or otherwise. You had to read assembly without thinking about it and recognize crypto constants, obscure file formats and compiler idioms on sight. You needed your own pile of IDAPython or Ghidra scripts, debugger discipline, and the patience to sit in one function for an entire afternoon, plus maybe some energy drinks or coffee to keep you going.

<figure>
  <img src="/img/flare-on-13/bocchi-typing.gif" width="400" height="300" loading="lazy" alt="Bocchi hunched over a glowing laptop in a dark room, headphones on, typing away while her guitar leans on the wall behind her.">
  <figcaption><em>Bocchi the Rock!</em> (CloverWorks, 2022)</figcaption>
</figure>

My run used very little of that directly, and where it did matter was noticing when an answer was **wrong**. Most of it went to watching agents work, pointing one at something it missed now and then (like where my IDA install was), and pulling them out of rabbit holes.

![Three of my messages from the run, between blurred agent replies: "holy heck we STILL havent solved this>?", "Come on GPT, I know you an do it; don't fall down rabbit holes anymore", and "I promise you that flag is a hint to get the actual flag, stop going down a rabbit hole AGAIN"](/img/flare-on-13/steering-rabbit-holes.png)

<small>Professional reverse engineering, 2026.</small>

The whole run cost less than half a year of IDA Home. IDA Pro was the only expensive tool involved, and I'd bet Ghidra or Binary Ninja with the same models would get about as far. Now, I know not everyone can afford IDA, and plenty of the people using it are on cracked copies. Ghidra is free, it's decent, and on some targets its decompiler even beats IDA's. Binary Ninja is a solid budget option that's been changing the game for a while. Each of these tools has its ups and downs, and agents can drive all of them: LaurieWired's [GhidraMCP](https://github.com/LaurieWired/GhidraMCP) and idasql's siblings [ghidrasql](https://github.com/0xeb/ghidrasql) and [bnsql](https://github.com/0xeb/bnsql) hand them decompilation, xrefs, ASTs, renaming and the whole nine yards.

It really doesn't matter which tool you use, so if you want to argue that, fine, but I'm going to talk about IDA since that's what I use.

## Hex-Rays noticed too

Hex-Rays announced its official [IDA MCP server](https://hex-rays.com/blog/hex-rays-ida-mcp-server) on September 25th, the same day FLARE-On 13 opened - coincidence? Probably not.

The second paragraph of the announcement reads: ["The reverse engineering capabilities of LLMs have dramatically improved over the past year and coding agent adoption has skyrocketed."](https://hex-rays.com/blog/hex-rays-ida-mcp-server#:~:text=The%20reverse%20engineering%20capabilities%20of%20LLMs%20have%20dramatically%20improved%20over%20the%20past%20year%20and%20coding%20agent%20adoption%20has%20skyrocketed) I didn't expect the company that sells IDA to make my argument for me the same week.

The server is free and open source, and it works with IDA Pro, Home, Classroom, and OEM. It doesn't care which model you use, and Hex-Rays says open-weight models ["have recently become proficient at reverse engineering tasks."](https://hex-rays.com/blog/hex-rays-ida-mcp-server#:~:text=The%20good%20news%20is%20that%20open%20weight%20models%20are%20widely%20available%20and%20have%20recently%20become%20proficient%20at%20reverse%20engineering%20tasks!)

Anthropic's own numbers back that up at the high end. In [their write-up on GLM-5.3](https://www.anthropic.com/research/glm-5-3-and-the-spread-of-advanced-cyber-capabilities), Z.ai's open-weight model built working end-to-end Chrome V8 exploits in 50 of 410 attempts, against 56 for Claude Mythos Preview. They also abliterated a copy (stripped the refusals out of the weights, kind of like making it "uncensored" while keeping most of its intelligence - it's shit I don't quite understand myself so this isn't the place to read about it): its refusal rate dropped from about 95% to just 6%, and its capabilities barely moved. That's exploit development rather than RE, but they're honestly the same skill set taken one step further, and anyone can download it.

Hex-Rays got usable results from Qwen 3.8 27B, quantized, on a single 24GB RTX 3090, though it needed more hand-holding because it "tends to get stuck and overthink." Their recommended setups include Sol or Astra through Codex and Opus 5.5 through Claude Code, the same model families Truix and I used. Getting started is one command:

```bash
uvx ida-hcli mcp install
```

On October 1st the [IDA 9.5 beta](https://hex-rays.com/blog/ida-9.5-beta-is-available) followed, billed as "a purpose-built release for the agentic era." It adds Assist, a free AI harness that runs inside IDA, and recursive decompilation (Ctrl+F5), which expands decompilation across the call graph for "both analysts and AI agents." The part that matters most here is **IDA Home**.

In 9.5 it gets online decompilers for 11 architectures and platforms along with the MCP server and Assist, and Hex-Rays titled that section "IDA Home 9.5 now makes hobbyists almost as powerful as Pro users." IDA Home starts at $365 a year for non-commercial use. IDA Pro with local decompilers starts at €4,999 (around $5,600)! ([pricing](https://hex-rays.com/pricing))

![Hex-Rays pricing for IDA Pro: Essential with 2 cloud decompilers from €1,099 a year, Expert with 2, 4 or 6 local decompilers from €4,999, Ultimate with all local decompilers from €8,599, and Headless by quote](/img/flare-on-13/ida-pro-pricing.png)

<small>IDA Pro's tiers on [Hex-Rays' pricing page](https://hex-rays.com/pricing). Local decompilers start at Expert.</small>

Free decompilers and community MCP servers aren't new. Ghidra has had a decompiler since the NSA released it in 2019, GhidraMCP and mrexodia's [ida-pro-mcp](https://github.com/mrexodia/ida-pro-mcp) each have over ten thousand GitHub stars, and both work with whatever MCP client you already use.

What changed this year is that Hex-Rays ships its own, for free, on the hobbyist tier. The ida-pro-mcp README now opens by recommending the official server instead. As I said in a follow-up tweet:

![My October 1st tweet: "Professional-grade reverse engineering just got waaaay easier and accessible to everyone. This is going to be a very interesting rest of the year." It quotes Hex-Rays' "The IDA 9.5 Beta is live!" post and shows 13.5K views.](/img/flare-on-13/tweet-ida-95.png)

<small>[The tweet](https://x.com/justmazz/status/2105738947015962832), quoting Hex-Rays' IDA 9.5 beta announcement.</small>

## Truix was faster

I wasn't even the fastest model-assisted run. Truix got from first flag to last in 2h 37m against my 4h 24m.

Count Flafy's hour (on Astra, going by their [tweet](https://x.com/FlafyDev/status/2104066943003025413)) and that's three runs under five hours on at least two labs' models, which pretty much rules out one model that just happens to be good at RE.

Truix pulled his numbers from his run's timeline and session transcripts, subagent logs included. Mine come from the main session file and every subagent's session file, with flag times off [my CTFd profile](https://flare-on13.ctfd.io/users/2314).

Cost on both sides is whatever the harness logged per call, which isn't necessarily what we got billed. My numbers also stop at the ninth flag. We were both on $200 subscriptions (OpenAI's for me, Claude Max 20x for Truix).

| | Me | Truix |
|---|---|---|
| Harness | omp | omp |
| Access Program | OpenAI Daybreak Blue | Anthropic CVP pre-October 6 |
| Models | Sol 6, plus Astra and jev-latest on challenge 7 | Opus 5, Opus 5.5 |
| First to Last Flag | 4h 24m 29s | 2h 37m 06s |
| Cost | $179.64 | $271.34 |
| Cost by Model | Sol 6 99.9%, Astra $0.16, jev-latest $0.002 | Opus 5 90%, Opus 5.5 10% |
| Model Calls | 3,963 Sol 6, 7 Astra, 11 jev-latest | 1,499 Opus 5, 373 Opus 5.5 (turns) |
| Total Tokens | 739.3M | 441.6M |
| In / Out | 8.60M / 1.67M | 4K / 1.58M |
| Cached | 729.0M (no read/write split) | 436.0M read / 4.04M write |
| # of Subagents | 34 (31 RE, 3 second-opinion) | 9 (1,144 turns, 60% of spend) |
| # of Cyber Refusals | 3, all on Astra on challenge 7 | 7 logged, up to ~37 implied |
| # of Times Steering | 17 | 67 (sigh) |
| Steering Breakdown | 15 coaching or rabbit-hole, 2 login | 30 directions, 37 refusal unblocks(!) |

## Per-challenge numbers

Challenge names and anything about what's in them stay out until the contest closes. Truix ran his on Saturday, September 26th, and I ran mine on the night of October 6th, so the clock times won't line up between the tables, and none of them compare to hall-of-fame times, which count from launch. "Finished at" is when CTFd accepted the flag, in Eastern time. My "time on it" runs from the previous accepted flag (or from when I started, for challenge 1). Truix timed his from each download, and his challenge 1 clock starts at his first prompt.

My run, almost all on Sol 6:

| # | Finished at | Time on it | Tokens | Cost | Refusals | Steering |
|---|---|---|---|---|---|---|
| 1 | 23:06:00 | 6:27 | 2.11M | $0.63 | 0 | 2 |
| 2 | 23:20:27 | 14:28 | 18.64M | $4.89 | 0 | 3 |
| 3 | 23:30:36 | 10:09 | 36.67M | $9.73 | 0 | 0 |
| 4 | 23:46:10 | 15:34 | 51.36M | $12.74 | 0 | 0 |
| 5 | 23:53:13 | 7:03 | 18.22M | $4.66 | 0 | 0 |
| 6 | 00:19:11 | 25:58 | 77.55M | $19.89 | 0 | 0 |
| 7 | 01:17:02 | 57:51 | 218.01M | $50.49¹ | 3 | 7 |
| 8 | 01:56:58 | 39:56 | 109.95M | $26.28 | 0 | 1 |
| 9 | 03:30:29 | 1:33:30 | 206.77M | $50.34 | 0 | 4 |

<small>¹ The only challenge where anything besides Sol 6 ran: Astra for 7 calls ($0.16) and jev-latest for 11 ($0.002).</small>

Truix's run, on Opus 5 and 5.5:

| # | Finished at  | Time on it | Models | Tokens | Cost | Refusals | Steering |
|---|---|---|---|---|---|---|---|
| 1 | 20:07:56 | 16:51 | Opus 5.5 | 1.65M | $1.15 | 0 | 8 |
| 2 | 20:12:38 | 4:41 | Opus 5.5 | 2.85M | $1.50 | 0 | 1 |
| 3 | 20:18:11 | 5:31 | Opus 5.5 | 9.61M | $4.13 | 0 | 0 |
| 4 | 20:28:47 | 10:35 | Opus 5.5 | 8.60M | $2.65 | 1 | 2 |
| 5 | 20:32:25 | 3:37 | Opus 5.5 | 6.15M | $1.63 | 0 | 1 |
| 6 | 20:39:29 | 7:01 | Opus 5.5 | 12.81M | $3.78 | 3 | 6 |
| 7 | 21:29:44 | 50:13 | Opus 5 + 5.5 | 73.41M | $43.05 | 1 (~25)² | 30 |
| 8 | 22:11:22 | 41:37 | Opus 5 + 5.5 | 152.54M | $99.45 | 1 | 13 |
| 9 | 22:45:02 | 33:38 | Opus 5 | 172.66M | $112.71 | 1 | 6 |

<small>² Only 1 refusal made it into his logs here. 25 of his 30 interventions on this challenge were pasted "this is a CTF" reminders after refusals that got killed mid-stream before the harness could record them, so the real count is up to about 25. Another 12 reminders landed on other challenges, and the logs don't say which.</small>

![Bar chart of time on each challenge, me vs Truix, in minutes. Me: 6, 14, 10, 16, 7, 26, 58, 40 and 94. Truix: 17, 5, 6, 11, 4, 7, 50, 42 and 34. The biggest gap is challenge 9.](/img/flare-on-13/time-per-challenge.webp)

<small>Time on each challenge from the two tables above. Mine counts from my previous flag and Truix's from each download, so small gaps are noise. Challenge 9 isn't.</small>

Now, the last three challenges of this event are usually where people get stuck for days. Together they took me 3h 11m and Truix 2h 05m. I was already behind going in, since the first six took me 1h 20m and him about 48 minutes.

Challenge 7 took me 58 minutes against his 50, and Challenge 8 was close, 40 minutes for me and 42 for him.

Challenge 9 is where the gap opened up: 1h 33m for me against his 34 minutes. He spent 94% of his money on those three, about $255 of $271. For me it was 71%, or $127 of $180.

Opus 5 only came in for his last three and still ended up with 90% of his cost, insane.

## Refusals and steering

Daybreak cut down the amount of cyber refusals but didn't remove them outright, which wasn't a surprise. FLARE-On challenges tend to look like malware, because malware is literally what the FLARE team works on, and a safeguard that sees one request at a time can't tell a CTF binary from a real sample even with my little prompt.

I hit **3**, all on challenge 7, all on Astra, and all in the same blunt second-opinion subagent. Each one came back as an API error saying the content was "flagged for possible cybersecurity risk," and after the third I had that subagent killed and relaunched. When you see what Challenge 7 entails it'll make a lot of sense.

![The infamous cyber refusals during challenge 7: three "This content was flagged for possible cybersecurity risk" errors (code=cyber_policy) between the subagent's blurred analysis steps](/img/flare-on-13/astra-refusals.png)

<small>All three, straight from the subagent's view in omp. Blurred some stuff so it doesn't give away the challenge.</small>

Sol never got one, which makes sense: Daybreak Blue only lowers refusals on Sol, while Astra keeps standard safeguards unless you're on Daybreak Red. Seems like Hex-Rays ran into the same thing - their MCP announcement recommends Opus 5.5 but warns that "cybersecurity safeguards frequently interrupt work," often enough that they suggest falling back to Opus 4.6 (what a sad day for cybersecurity that will be once that model gets sunset).

I had to step in 17 times. 15 were coaching or pulling an agent out of a rabbit hole, and the other 2 were me logging into a browser tab it needed.

Challenge 7 took 7 of the 17, the most of any challenge, and Challenge 9 took only 4. I honestly don't know how many minutes refusals and steering cost in total. The logs don't split it out, and I'd rather not guess.

Truix's number is harder to pin down. His transcripts only record 7 refusals, 3 in the main session and 4 in subagents, but he pasted a CVP organization ID or "this is a CTF" reminder 37 times to get the model moving again. Was pretty funny watching him yell at the model and constantly paste in the same thing only to get denied the next turn.

Tangent: Anthropic, **please** let us use these models. You scan our goddamn faces and read our IDs, for Christ's sake. If we're doing something wrong, you have every right to take action - anyway, back to the post.

Most of his refused turns got killed mid-stream before the harness wrote anything down, so the real count is somewhere between 7 and about 37. I reckon it was probably 37. Even the low end is more than my 3.

Challenge 7 was brutal: 30 of his 67 interventions landed there, 25 of them reminders instead of actual technical direction, and at 50 minutes it was the longest challenge of his run - likely due to all the refusals stopping forward movement.

## What a lower barrier means

FLARE seems fine with all of this - mostly. This year's [announcement](https://security.googlecloudcommunity.com/community-blog-42/announcing-the-13th-flare-on-challenge-8279) from Nick Harbour (lead organizer of the event) literally told people to "trial run your AI assistants on the challenges and solutions from previous years," while his [facetious tweet](https://x.com/nickharbour/status/2104582862750015945) and the [FLARE-On 13 hall of fame](https://flare-on.com/hof.html), which lists every single finisher as "AI", suggest they feel a little differently now that it's happened. Personally, I think allowing models is the right call. A remote single-player contest has no way to enforce a ban on models, and a ban would mostly reward the people willing to lie about it.

![Nick Harbour's September 28th tweet: "I went ahead and put up the Hall of Fame for this year, even though the contest just started. flare-on.com/hof.html #flareon13"](/img/flare-on-13/tweet-nick-hof.png)

![The FLARE-On 13 hall of fame page: "Current Champion: AI", with every finisher listed as "AI"](/img/flare-on-13/hall-of-fame.webp)

<small>[Nick's tweet](https://x.com/nickharbour/status/2104582862750015945) from September 28th, and the [hall of fame](https://flare-on.com/hof.html) it links to, as of October 7th.</small>

When I started REing, you learned from scattered tutorials and forum posts and could be stuck for days with nobody to ask. Now you can open a binary, ask a model what a function does, and check its answer in a debugger a few minutes later. You can also let an agent solve a challenge end to end and then work back through each step yourself, which beats most of what I learned from.

The same goes for people with worse intentions. In [my 2027 predictions post](/blog/effort-was-the-security-control/) I argued that a lot of what we treat as secure is really just **tedious**, and that once models do the tedious part for the cost of compute, a control nobody wrote down goes away.

FLARE-On 13 put that on a public scoreboard, and none of it is specific to CTFs: whatever made Flafy's hour possible works the same on a real malware sample or a license check, for someone with just as little background.

If I could change one thing about the contest, I'd have finishers report their setup next to their time (models, harness, cost, how often they stepped in). A few years of that would track how fast the models are improving better than most benchmarks do. AI as a whole and AI-assisted workflows to reverse engineer aren't going anywhere, so we might as well embrace them and measure them.

## Next year

I don't know what FLARE-On 14's winning time will be, hell, I don't even know if it'll be hosted again.

Two years isn't a trend, but almost 28 hours down to one, with models in the loop both times, doesn't leave much doubt about the direction. My guess is that next year the limit is how fast someone can download each challenge and submit the flag - unless FLARE starts designing challenges against models.

If you've been putting off learning reverse engineering because it looked like years of grinding before you'd get anywhere, start now. Every past FLARE-On is [still up](https://flare-on.com/) with the challenges and the official write-ups, so grab an old one, let a model solve it, then go back through every step yourself in a debugger until you could've done it without the model. Noticing when it's wrong is the part that still takes practice, and honestly it was the only useful thing I did during my run.

If you defend something, assume whoever is looking at it has the same models I did and can get through it in **hours**.

The write-ups go up on October 23, and I'll post on X when they do.

If you ran FLARE-On 13 with models and kept your numbers, send them over. I'd like to put a few more runs next to ours and expand this post over time until the event is over.
