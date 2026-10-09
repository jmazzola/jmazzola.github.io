---
title: "most security is just tedium: my 2027 predictions"
description: "a lot of what we call 'secure' is really just 'tedious'. my 2027 predictions on gold farming, emulation, bots, cheats, exploits, n-days, and RSA-1024 once models do the tedious part."
date: 2026-10-09
category: thoughts
---

On September 7th, I posted [a thread of predictions for 2027](https://x.com/justmazz/status/2097087510857801955): RWT gold crashing, console exclusives emulated on PC before their PC release, Windows 10 [going the way of XP](https://www.tomshardware.com/software/windows/idle-windows-xp-and-2000-machines-get-infected-with-viruses-within-minutes-of-being-exposed-online), RSA-1024 falling over. It didn't get any replies, which - fair, a list of predictions with no reasoning doesn't give anyone much to reply to, so let's make a blog post to explain the method to the madness!

![My September 7th tweet that started the thread: "predictions for 2027 due to Astra and other AGI-capable models being accessible:" with three bullets: RWT in-game currency like OSRS/WoW gold is going to crash, same goes for any kind of sneakerbot, and console exclusives will be emulated on PC before their official release starting with GTA 6. It has one like and one reply.](/img/2027-predictions/thread-sept-7.webp)

<small>[The thread](https://x.com/justmazz/status/2097087510857801955) in question. That one reply is me continuing the thread.</small>

Pretty much all of them come from the same place. A lot of what we treat as "secure", "scarce", or "profitable" is really just **tedious**. Farming in-game currency takes hours and programming a bot to do it takes an excruciating amount of time when you want to have it pinpoint repetitive tasks; especially if you are trying to make it seem legit (duh). Turning a patch diff into a reliable exploit usually takes days of trial and error, specific setups and sometimes depending on the exploit's reliability; that makes life hell too. Getting an emulator running on new hardware takes months, sometimes years, to perfect enough to run a game other than just an official tech demo. Nobody writes "this takes a skilled **human** a long time" into a threat model, but every one of these systems indirectly leans on it, and models that do that work for the cost of compute now make it that much easier, leaving systems we used to consider safe **vulnerable**.

While developing cheats, my job was finding the cheapest and easiest path through a game's defenses whether that was anti-cheat or anti-tamper. As a security engineer, it's my job to make that path expensive or tedious enough that most people **(humans)** give up. When all those skilled hours get cheap, accessible and easy to automate, that changes the game entirely and makes defending against it a **hell** of a lot harder to deal with.

## Effort as an unspoken security measure

Every threat model has an idea or should have an idea for what the attacker can do or is capable of. Very few identify what the attacker can **afford** to do, mostly because the answer hasn't moved in decades, since skilled hours are expensive, rare, slow to scale and hard to measure.

A CAPTCHA doesn't prove you're human per se; it makes each attempt cost a potential attacker a few seconds of their attention which throws a wrench in any kind of automation they planned on using. An MMO economy assumes gold comes from somebody's hard-earned time, and like real currency, that's what gives it a price. A diffed patch can uncover a potential bug, but turning that into a working exploit has historically taken a skilled reverse engineer specializing in writing exploits days to weeks. A console exclusive is protected partly by trusting that the console's encryption and security measures are strong enough to protect the first week of sales and its bottom line. Emulation was a known but calculated risk as it took a long time for a small group of niche nerds obsessed with their console to write an emulator, let alone write one to successfully run the game with recommended settings smoothly. RSA-1024 has been [disallowed for new signatures since the end of 2013](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-131a.pdf), yet nobody had published a factorization, because doing it took both a team of specialists and [hundreds of thousands of CPU core-years](https://cognition.com/blog/factoring-rsa-260#appendix-1-estimated-cost-of-factoring-other-rsa-numbers).

Each of those things had a price, and now models change the **cost** of that labor. You still pay for compute and someone still has to steer - sure, but the **expert** was always the expensive part and with these models **that's what's getting cheaper**.

The clearest example of this came out four days before my thread. [Eric Lu](https://x.com/penlume) at Cognition factored RSA-260, and [his write-up](https://cognition.com/blog/factoring-rsa-260) is worth reading just for how plainly he separates what he did from what the agents did. He describes his own role as mostly an "executive function" while agents built and tuned the GPU code. Agents "substituted for what would likely have been a multi-month effort by a team of highly specialized domain experts." After reading that and comparing my recent experiences using these tools, I started listing stuff off.

## RWT (Real World Trading) & Sneakerbots


Real world trading, albeit a looked-down-upon practice, is a major market and one that isn't going away anytime soon, keeping video game economies flourishing. The price of gold in any of your favorite MMORPGs (Old School RuneScape, World of Warcraft, FFXIV) is set by what it costs to produce: farmer labor, bot development, bot farm setup, resources to continuously farm using those bots and of course any accounts lost to bans. Bots usually get caught because they're repetitive, use the same routes, around the same timing and give the same reaction to the same stimuli. So, botting operations would have to pick between spending resources getting bots that realistically mimicked human actions and bots that are cheap to build and easy to scale, but easy to catch.

<figure>
  <img src="/img/2027-predictions/mmo-junkie-key-mash.gif" width="480" height="270" loading="lazy" alt="A woman sobbing at her desk at night while hammering her keyboard with both fists.">
  <figcaption><em>Recovery of an MMO Junkie</em> (Signal.MD, 2017)</figcaption>
</figure>

Now, models remove that tradeoff completely. A bot that varies its routes, takes breaks, answers a player who talks to it, and adjusts its actions after a ban wave used to be a serious engineering project. Now using a [decent model](https://arxiv.org/abs/2601.02427); especially with [computer use](https://arxiv.org/abs/2403.03186)? It's a weekend project. Producing gold has never been cheaper, and detection is getting worse at the same time, so naturally, the supply goes up and the price comes down.

Sneakerbots get hit from a different angle. Bots already automate checkout. What separated the good ones from the rest was keeping up with retailer defenses: obfuscated JavaScript challenges, device fingerprinting, and request signing. That's just reverse engineering grind, exactly the kind of work models are really good at **speeding up**. Once every bot works on release day, owning one stops being an advantage, resale margins shrink, and retailers lean harder on raffles, identity checks, and member-only drops rendering these bots far less useful than previously.

I'd bet on gold prices falling. Whether that looks like a crash or a slow slide I'm less sure about, and as such I feel about the same on sneakerbots. The way this goes wrong is if the bottleneck moves from bot quality to account creation. If phone verification, payment binding, or hardware attestation makes every fresh account expensive, supply stays capped no matter how good the bots get, and the whole thing turns into the identity problem I get to further down in the article.

## Console exclusives and emulating GTA 6 on PC before release

GTA 6 launches November 19, 2026 on PS5 and Xbox Series X|S, and Rockstar, like with previous releases, [hasn't announced a PC release date](https://mashable.com/entertainment/gta-6-will-not-launch-on-pc-in-november-explainer). GTA V reached PC [about 19 months after its console launch](https://www.rockstargames.com/newswire/article/4k41288381494k/gtav-pc-new-release-date-first-screens-and-system-specs), and Red Dead Redemption 2 [about a year after](https://www.rockstargames.com/newswire/article/9k1248838o2974/Red-Dead-Redemption-2-Coming-to-PC-November-5th). Gamers, especially in the modding space, hate waiting and now with these tools at their disposal, there's no doubt in my mind that the same collective hivemind will get GTA 6 running on PC through emulation before its official release date and after that gets proven, console exclusives in general would be a thing of the past.

When I first posted that, I thought PS5 emulation was pretty weak, but it turns out it's WAY further along than I gave it credit for.

[KytyPS5](https://github.com/KytyPS5/KytyPS5) runs Demon's Souls, Astro Bot, and most importantly: Grand Theft Auto V, which now reaches gameplay in both **Performance and Performance RT modes** after ray-intersection support landed. Demon's Souls went from about [2 FPS to 10-18 FPS between two builds a day apart](https://www.dsogaming.com/news/ps5-emulator-kytyps5-gets-a-huge-performance-boost-running-demons-souls-remake-at-10-18-fps/).

Thanks to all of this being open-source and people pointing these models at these impressive repos, progress isn't slowing down anytime soon. In the last **two weeks alone**, HITMAN 3, Crash Bandicoot 4, Spider-Man: Miles Morales, Hi-Fi RUSH, UFC 5, and Dragon Ball Fighter Z all went in-game, and Horizon Forbidden West reaches the main menu, with fixes in review that get it to the New Game loading screen ([September 21–27](https://github.com/KytyPS5/KytyPS5/discussions/861), [September 28–October 4](https://github.com/KytyPS5/KytyPS5/discussions/887)).

[SharpEmu](https://github.com/sharpemu/sharpemu), written in C# of all things, had 12 of 55 tested titles in-game and six running at **60 FPS** as of its September 25 build ([Tom's Hardware](https://www.tomshardware.com/desktops/gaming-pcs/ps5-emulator-successfully-runs-six-titles-at-a-playable-60-fps-ps5-emulation-continues-to-gather-momentum-as-developers-improve-shader-translation-and-vulkan-support)), although the 60 FPS ones are small games like Tetris Forever and Dreaming Sarah. A week later, its [October 3 build](https://github.com/sharpemu/sharpemu/releases/tag/v0.0.5-nexus) took [GTA V through the prologue to Los Santos](https://github.com/sharpemu/sharpemu/pull/1015) at around 15 FPS, and shipped fixes and speedups for Demon's Souls and Astro Bot. Just a reminder, in **July** it was **[just starting to boot games successfully](https://www.tomshardware.com/video-games/playstation/ps5-emulation-ramps-up-in-wake-of-sonys-end-to-physical-media-ps5-titles-now-booting-across-different-emulators-with-rapid-community-development-for-both-2d-and-3d-games)**.

![GTA V running in SharpEmu: a character standing at a gate outside a purple house in Los Santos, with SharpEmu's debug overlay reading FPS 2.0 and the window title reading SharpEmu - dev - Grand Theft Auto V](/img/2027-predictions/sharpemu-gta-v-los-santos.webp)

<small>GTA V in Los Santos on SharpEmu, from [the PR that got it there](https://github.com/sharpemu/sharpemu/pull/1015). That overlay says 2 FPS because it's a dev build; the PR says a release build hovers around 15.</small>

The PS5 runs closed-source system software on an [AMD Zen 2 CPU with an RDNA 2-based GPU](https://blog.playstation.com/2020/03/18/unveiling-new-details-of-playstation-5-hardware-technical-specs/), so nearly all of the CPU side [runs natively on a PC](https://www.tomshardware.com/desktops/gaming-pcs/ps5-emulator-successfully-runs-six-titles-at-a-playable-60-fps-ps5-emulation-continues-to-gather-momentum-as-developers-improve-shader-translation-and-vulkan-support) with no instruction translation; SharpEmu only has to [patch a handful of instructions](https://github.com/sharpemu/sharpemu/tree/main/src/SharpEmu.Core/Cpu/Emulation), like AMD-only SSE4a, on CPUs that lack them. What's left to emulate is the tedious part: reimplementing the system modules a game calls, handling enough of the kernel interface to keep it happy, and then translating GPU command buffers and shaders to run in [Vulkan and SPIR-V](https://github.com/KytyPS5/KytyPS5#developer-information).

For each library function, you work out what it does from how it's called, write something compatible, run the game, see what breaks, and repeat that a few thousand times but every step can be checked against a real game. Repetitive work? Needs tests? Huge loop? Sounds like the perfect work for **agents**. People speculated that AI-written code was behind Kyty's pace. Some of it demonstrably is: a dozen merged commits credit Claude, Codex or Copilot as co-authors (and that's only counting people who leave the co-author tag on), and one contributor's [AI-assisted fork](https://github.com/KytyPS5/KytyPS5/pull/939) roughly doubled Demon's Souls' frame rate. The maintainer's own commits don't carry those tags, so I can't say how much of the core work it drives.

The real precedent is Tears of the Kingdom. It leaked about two weeks early and was running on Switch emulators **before release day**; Nintendo later claimed [**a million** pre-release downloads](https://www.ign.com/articles/nintendo-says-tears-of-the-kingdom-was-pirated-1-million-times-pre-release-in-lawsuit-against-emulator-creator) in its lawsuit against Yuzu. GTA 6 is likely held up to the same bar, and what matters is whether the PS5 is compromised.

As I type this, the PS5 has in fact been jailbroken. The [Relapse exploit](https://kotaku.com/new-ps5-jailbreak-exploit-works-on-systems-running-july-2026-firmware-2000738283) went public on September 29 for every firmware up to 13.60, people are already running game backups on it (newly released Marvel's Wolverine included), and the tooling to dump and re-sign those backups already exists.

It doesn't help with GTA 6 yet, though I've seen people speculate that the game will need firmware 14.00 or newer. In my opinion, what will likely happen is that Sony will drop a new firmware update that addresses the jailbreak the same day as the game releases.

So given all that, PS5 or Xbox exclusives being playable on PC through emulation before their official PC release in 2027 is more likely than not. If Rockstar decides to ship PC within a few months of launch, the question goes away but there's no chance this doesn't reintroduce the age old risk and fear of emulation back into the industry.

## Model-driven trading

Fair warning, this is the one furthest from anything I actually know. I dabble in crypto and stocks, mostly just picking a few and going long so there's no day-trading pressure, but I'm not running models on them, so everything here is from the outside looking in.

<figure>
  <img src="/img/2027-predictions/fx-senshi-kurumi-chan-kurumi-chan.gif" width="374" height="210" loading="lazy" alt="Kurumi-chan sits at her desk freaking out about a bad forex trade.">
  <figcaption><em>FX Fighter Kurumi-chan</em> (Passione, 2026)</figcaption>
</figure>

I said trading would end up exclusively model-driven, built on micro-adjustments humans can't find on their own. However, most market volume is already algorithmic, and "exclusively" was a tweet word; humans will likely still trade in 2027. What I'd actually defend is much narrower: model-driven strategies take a **bigger share**, and agents **placing trades for retail users** become normal.

Crypto is where you can already watch this happen thanks to everything ✨being on the blockchain✨. [A DWF Ventures report in April](https://x.com/DWFVentures/status/2044762919997722936) put autonomous agents at about 19% of on-chain activity, but most of that is narrow work like MEV capture and stablecoin routing. In a [stock-trading contest run by trade.xyz](https://decrypt.co/364727/ai-agents-already-run-a-fifth-of-defi-but-still-lose-to-humans-at-trading), the top human beat the top agent by more than 5x.

The cleanest public test is Nof1's Alpha Arena. Its first season last fall gave six frontier models **$10,000 each in real money to trade crypto perpetuals on Hyperliquid**, and after **17 days** only **two** turned a profit. The follow-up moved to U.S. tech stocks with eight models across four rounds: the combined portfolio [lost about a third of its capital and only 6 of 32 runs finished in profit](https://www.business-standard.com/markets/news/ai-bots-auditioning-for-wall-street-trading-are-mostly-losing-money-126050701793_1.html). Nof1's own founder: "Giving an LLM money right now and just having it go, that's not a thing yet."

[Jim Moran's Flat Circle blog](https://blog.flatcircle.ai/p/ai-trading-arenas) tracked 11 of these arenas and found every one had at least one winning model, but the median model only made money in two, which is what luck looks like. The academic benchmarks land in the same place: on [StockBench](https://arxiv.org/abs/2510.02209) most models couldn't beat a simple buy-and-hold, and [LiveTradeBench](https://arxiv.org/abs/2511.03628) found that topping general leaderboards doesn't mean they're trading better. So right now, agents win where the job is narrow and repetitive and lose where it needs true judgment.

Now, the judgment part is what's moving. Forecasting is the closest thing to that skill you can actually benchmark, and the Forecasting Research Institute's ForecastBench scores models directly against superforecasters. **A year ago** [superforecasters still led](https://goodjudgment.com/human-vs-ai-forecasts/). In **May**, AI systems **matched them on the data-driven questions**, and by **July** several systems were [**statistically indistinguishable from superforecasters overall**](https://forecastingresearch.substack.com/p/ai-models-have-likely-reached-parity), with one ranking **above** the superforecaster median on prediction-market questions for the first time. FRI's own caveats are fair: the superforecaster baseline is from 2024 and the confidence intervals overlap, so "parity" is the honest word, not "better".

The idea behind this whole post also argues against me here. When everyone runs similar models, they'll find the same micro-adjustments, their trades get correlated, and then that edge disappears, the same way sneakerbots stop mattering once every bot works and can be personalized and developed over a weekend.

Also let's be real, if someone **does** find a real edge, the rest of us won't know. Alexander Izydorczyk, formerly head of data science at Coatue, put it well: ["When LLM agent trading strategies start working, you will not hear about it for a while."](https://magis.substack.com/p/ai-trading-bots-dont-work-yet) So I'm not very confident in this one for 2027, and if the edges get arbitraged away fast enough that traditional strategies hold their share, I'll take the L.

## Bots that blend in

Back in 2020 when my friends and I were hooked on Team Fortress 2, I got annoyed enough at being autobalanced away that I reversed how the server decides who gets moved. If you didn't know, it sorts players by a "score" that's literally `0 - curtime - connect_time`, where `curtime` is the current time and `connect_time` is when you joined, and that gets checked every second once the round starts. So the longer you'd been on the server, the more likely you got moved; didn't matter how well you were doing or how trusted you were. I'm not sure what Valve was thinking with that one, but bot detection works the same way, just with a better score: rank players by how human they look and draw a line. That works right up until bots look as human as the other players on the server.

#SaveTF2 and #FixTF2 happened over bots that were pretty crude: obvious spinbots aimbotting everyone, spamming voice clips and name changes. And let's not forget the vote-kick abuse, where they'd keep calling votes to kick real players, which tied up the vote queue so nobody could call one on the bots. Crude bots are easy to detect in principle - the hard part is responding at scale.

My prediction is the next generation won't be crude: they'll queue into matchmaking, play like mediocre players, and quietly farm levels, drops, and/or account value. Nobody's match gets visibly ruined; the player population and the economy just wear down while the bots look statistically like people. CS2's farm accounts are the same problem one layer over, and on social media, LLM-driven accounts already pass casual inspection.

Funny enough, both halves of that are already being built. Odyssey's [Odyssey-3](https://odyssey.systems/introducing-odyssey-3) world model learned to play GTA V from gameplay recordings paired with keyboard and mouse input, and a movement policy trained on about two hours of GTA footage rode a horse in Red Dead Redemption 2 without any policy training on that game. That's a bot that only looks at the screen and presses keys, with nothing running inside the game for anti-cheat to find.

![Odyssey-3's policy riding a horse across a misty grassland in Red Dead Redemption 2, with a corner overlay lighting up the W key and mouse inputs it's pressing](/img/2027-predictions/odyssey-3-rdr2-horse.webp)

<small>Odyssey-3's GTA-trained policy riding a horse in Red Dead Redemption 2, with no policy training on that game. The overlay is the keys and mouse it's pressing. From [Odyssey's announcement](https://odyssey.systems/introducing-odyssey-3).</small>

On the human side, Diachronic just announced [Kairos 1](https://x.com/kevinbanghe/status/2107141940785377333), a model built to simulate how a specific person talks and decides rather than an average user, trained on open-ended answers from more than 100,000 people (yes, that's the Black Mirror episode [Be Right Back](https://en.wikipedia.org/wiki/Be_Right_Back), minus the android). Both are the companies' own numbers, and Kairos's come from an early checkpoint, so I'd want outside testing before leaning on them _too_ hard.

Put a bot that plays like a real player together with a model that talks like a specific person, and you get what I was getting at in the thread: bot accounts that blend in with the general public so well that detection starts flagging real people more often, in games and on social media alike.

CAPTCHAs are already cooked as a human test. A [USENIX Security 2023 study](https://www.usenix.org/conference/usenixsecurity23/presentation/searles) found bots beat humans on both speed and accuracy across the CAPTCHA types the researchers measured. Serious bot detection moved to behavior a long time ago: mouse dynamics, session patterns, account graphs, and device signals.

Behavioral detection is a classifier, and every classifier has a threshold. It works as long as bots and humans behave differently enough to separate. As models push bot behavior toward the human distribution, the two will overlap, and any threshold that still catches bots catches people too. Defenders end up choosing between banning more real users and catching fewer bots, and I expect most of them to quietly pick the second.

When "is this a human?" stops having a good answer, defenders switch to "is this account expensive?" That means phone and payment binding, hardware attestation, and rate limits on economic actions. Every one of those costs something in privacy and accessibility, and every one moves the fight from detecting bots to **pricing identity**.

The catch is that identity is already for sale. Marketplaces like [PlayerAuctions](https://www.playerauctions.com/steam-account/level/) list aged Steam accounts by registration year, with filters going back to 2003, plus levels, game libraries and years-of-service badges, at prices from about $5 to five figures. Cheaters buy exactly those: a decade-old account with a real library and a few hundred dollars of skins in the inventory looks like the veteran player Trust Factor is built to protect, so whatever "trusted identity" check comes next, it starts out already bought.

Of everything in the thread, this is the one I'd actually put money on. The only thing I can see stopping it is cheap, widely deployed proof of personhood or device attestation that makes mass account creation expensive again, and I don't see that showing up in 2027.

## Computer-vision cheats

This is the prediction closest to my old job. I said computer-vision cheats would become the most popular kind of cheating, and undetectable.

Traditional cheats read and write game memory, which is exactly where anti-cheat has the most visibility: handles, drivers, memory integrity and code signatures. Computer-vision cheats skip memory entirely. They capture the rendered frame, run an object detector on it, and drive input. Some setups split the work across a second machine or even secondary hardware, so nothing on the gaming PC ever touches the game process itself.

None of this is theoretical anymore; it's on GitHub. One of the more popular ones calls itself a "Universal Second Eye for Gamers with Impairments" (the repo title adds "AI Aimbot" in parentheses, and the website pitches it as a way to "win all your games" and "get all the kills", so at least they're honest about it). It runs a YOLO model through ONNX and DirectML, so it works on NVIDIA and AMD cards alike. It has a store of community-trained models for different games, five different ways to move the mouse, including through Logitech's and Razer's own drivers, and a video tutorial on labeling your own screenshots and training a model on them - which uses Roblox as the example. Your freaking grandma could make a computer-vision cheat now.

That leaves anti-cheat looking only at output, which is where I think anti-cheat is headed anyway: analyzing aim behavior, reaction times, input device characteristics, statistical oddities across a lot of matches measured against trusted baselines.

Valve's VACNet, which [a Valve employee presented at GDC 2018](https://www.gdcvault.com/play/1024994/Robocalypse-Now-Using-Deep-Learning), is the public example of an overly ambitious approach, and CS2 is the public example of how far it gets you.

This year alone there was a [bypass that let rage cheats slip past VACNet for months](https://www.techtimes.com/articles/322114/20260729/valve-closes-cs2-vacnet-bypass-that-let-rage-cheats-evade-ai-detection-months.htm), and the bans that do land only hit the account, not the hardware, in a free-to-play game where a new account costs nothing. You'll run into the same cheater next week under a different name. Add a usermode anti-cheat that the cheating scene moved past about a decade ago, and output-based detection is doing all the work with none of the backup. That runs it right into the same classifier problem as bots.

Smoothed aim paths with a low FOV, inconsistent reaction delays, and overcorrections and undercorrections fitted to a human distribution with a few deliberate misses? How do you tell that apart from a legit player? Now I know there'll always be a way to tell, humans are creatures of habit - but you should know what I mean, it just gets a lot harder to find the data to identify them.

Not to mention, when VACNet flags someone on gameplay alone, the usual result isn't even a ban. [VAC Live](https://vac-ban.com/wiki/vac-live) cancels the match and hands out a cooldown that starts around a day and climbs to about a week for repeat flags; the permanent ban is saved for actually detecting cheat software, and even that barely happens anymore. Cheat developers noticed back in [October 2025](https://www.unknowncheats.me/forum/counter-strike-2-a/723657-vac-modules-disabled.html) that Steam had stopped streaming VAC's scan modules to CS2 clients at all, even on fresh accounts, and [it's still that way](https://www.unknowncheats.me/forum/anti-cheat-research/758792-vac-modules-missing-vac-load-modules-2026-cs2.html) as of this summer. As far as I can tell, Valve is going all-in on VACNet and ML-driven detection instead of the usermode challenge-response system built into Steam.

If Valve won't permaban on its own model's verdict, that tells you how much they trust it. Their newest fix is bringing Overwatch back, sort of: since August, trusted invited players [review 10–15 second clips in a browser](https://www.pcguide.com/news/valve-is-bringing-overwatch-back-to-counter-strike-as-players-invited-to-new-vacnet-video-review-program), and their verdicts don't touch the accused at all: they're labels for training VACNet. In CS:GO, Overwatch reviewers could actually get a cheater banned; now they're literally grading homework for the model.

![Valve's VACNet Labeling Portal: a Counter-Strike 2 clip with X-Ray on, next to buttons to label the suspect for aim assist, wall hacks, auto bhop, or being a bot. The instructions say the player you're watching will not be directly affected by your verdict, and that labels may be used to train future VACNet models.](/img/2027-predictions/vacnet-labeling-portal.webp)

<small>The VACNet Labeling Portal, via [@aquaismissing](https://x.com/aquaismissing/status/2086974207657660473). Read the second bullet.</small>

From the cheat side, the rule never changed: take the cheapest path that doesn't get you detected. When memory access got expensive, the market moved away from the game process, and computer vision is just the next step along that curve. Staying undetected in Counter-Strike used to take real reverse-engineering skill looking at the VAC mapped modules, and having a fair understanding of Windows internals. A CV cheat takes **ML skill** instead, or at least it used to, before models made that cheap too.

"Undetectable" was too strong, though - I'll own that one. Detection of these cheats moves almost entirely to behavioral and statistical methods, which are slower, need a lot of matches' worth of evidence, and carry false-positive risk. And no, this isn't me picking a side in the kernel vs. usermode debate - that's a whole other blog post. With a CV cheat, the evidence lives on the screen and in the input, so that's where detection has to look, and when it does catch someone, the ban has to actually cost them something. How hard they end up being to catch depends on whether signed, attested input from certified devices becomes standard, or whether server-side models get good enough to catch them in big ban waves.

Point is, this is already becoming a problem for online gaming, so I'll take the popularity half as a W.

## Windows 7 and 10 going the way of XP (and WannaCry 2)

This one's from the thread too: Windows 7 and 10 ending up as unusable on the internet as XP is today, and something on the scale of WannaCry happening again.

Quick timeline first. Windows 7's last paid security updates ended back in January 2023. Windows 10 hit end of support on October 14, 2025, and Microsoft has since [extended the free consumer ESU program to October 12, 2027](https://www.bleepingcomputer.com/news/microsoft/microsoft-quietly-extends-free-windows-10-esu-support-to-october-2027/). Meanwhile, Patch Tuesday has been absolutely massive: 570 flaws fixed in July, about 400 in August, and **[966 in September](https://www.bleepingcomputer.com/news/microsoft/microsoft-september-2026-patch-tuesday-fixes-966-flaws-2-zero-days/)**, the biggest release Microsoft has ever shipped, and it dropped the day after my thread went up. Microsoft has literally said [AI-driven vulnerability discovery](https://www.bleepingcomputer.com/news/microsoft/microsoft-expects-more-windows-security-updates-from-ai-discovered-flaws/) is behind the jump and that customers should expect more of it from here on.

That's great for anything still getting updates and terrible for everything else. Every patch is a diff, and if you didn't know, patch diffing is a pretty well-worn workflow: compare the binaries, find the fix, work out the root cause, write the exploit. For an unsupported OS that shares the affected code, every diff is basically a free bug report with no fix coming. Nobody had to go after XP specifically; years of fixes for newer Windows pointed straight at XP code that was never getting patched. It didn't help that the [XP SP1 source code leaked on 4chan in 2020](https://www.theverge.com/2020/9/25/21455655/microsoft-windows-xp-source-code-leak), and people had [working builds compiled from it](https://www.bleepingcomputer.com/news/microsoft/windows-xp-and-server-2003-compiled-from-leaked-source-code) within a week. At that point you don't even need to reverse the old binaries; you can read the original code and hold it up against whatever got fixed in newer Windows. 966 diffs in a month is way past what a human team can triage and well within what a model pipeline can, and the same models that found the bugs can diff the fixes too.

Supported systems get a milder version of the same problem: the time from Patch Tuesday to a working exploit keeps shrinking, but the time it takes a real fleet to actually roll out the patch doesn't.

WannaCry is the reference case here. Microsoft shipped the fix (MS17-010) on March 14, 2017, and WannaCry hit on May 12, two months later, tearing through machines that just hadn't applied it. A repeat needs three things: a wormable bug, a big unpatched population, and someone willing to build the payload. Cheap patch diffing speeds up the first, and September's release already had a good candidate: [CVE-2026-69730](https://msrc.microsoft.com/update-guide/en-US/advisory/CVE-2026-69730), a critical Windows DNS bug that also hits Windows 10. One crafted packet from an unauthenticated attacker is all it takes, and Microsoft [rates it as likely to be exploited](https://krebsonsecurity.com/2026/09/microsoft-plugs-nearly-1000-security-holes/). Windows 7 holdouts and Windows 10 machines that never enrolled in ESU supply the second. And the third is the easy part now: there are plenty of local open-weight models with the [refusals stripped right out](https://www.anthropic.com/research/glm-5-3-and-the-spread-of-advanced-cyber-capabilities), and you can run them on your own gaming PC with no provider logging your prompts or banning your account once they see what you're trying to do.

![The WannaCry ransom screen: Ooops, your files have been encrypted! Countdown timers for when the payment doubles and when the files are lost, and a demand for $300 worth of bitcoin.](/img/2027-predictions/wannacry-ransom-screen.webp)

<small>WannaCry's ransom screen, two months after the fix shipped. Screenshot via [Kaspersky's Securelist](https://securelist.com/wannacry-ransomware-used-in-widespread-attacks-all-over-the-world/78351/).</small>

Windows 7 is arguably there already. Windows 10 in 2027 is murkier, since enrolled machines keep getting fixes until October 2027 and unenrolled ones don't. A single WannaCry-scale event next year? I'd call that less likely than not. A pile of smaller self-propagating incidents seems a lot more likely to me. I'll know I overcalled this one if the time from patch release to in-the-wild exploitation doesn't visibly shrink over 2027. Guess we'll see, and I sure as hell hope I'm wrong.

## Breaking RSA-1024

The thread said RSA-1024 would be completely factored, causing chaos for any product still using it to protect stored secrets. I'm sticking with the factoring part. The "chaos" part is what I have to walk back.

Here's where things actually stand. On September 3rd, RSA-260 (862 bits) got factored, beating the RSA-250 record that had stood since 2020. According to [Lu's write-up](https://cognition.com/blog/factoring-rsa-260), it took about 4,900 GPU-days, roughly $400k at market prices, and it ran on spare capacity in a training cluster. He used a heavily modified CADO-NFS with a new GPU lattice siever, and he's upfront that there were "essentially no algorithmic advancements" - it was just performance engineering, done mostly by agents in about three weeks. He puts RSA-1024 at about 78 times the work of RSA-260, which is roughly **$30M** at market GPU prices, and thinks more optimization could cut that in half. RSA-2048 is still about a billion times harder than RSA-1024, so that one isn't really affected.

Saying "completely factored" was sloppy of me. Factoring usually works one modulus at a time, so each 1024-bit key costs somewhere between $15M and $30M on its own, and there's nothing that breaks them all at once. What you'd actually see is targeted breaks of keys protecting something worth the total cost. The ones I'd worry about are long-lived keys you can't rotate: signing keys burned into hardware, old code-signing and license-signing keys in software that shipped years ago, and DKIM keys that would let someone send mail as your domain (nightmare). What's new here is that breaking a 1024-bit key now has a **price tag**, and I'd expect that price to keep dropping every year.

If you want to know where you stand, you don't need anything fancy. `openssl` and `ssh-keygen` will tell you the key size of pretty much anything:

```bash
# a certificate file
openssl x509 -in cert.pem -noout -text | grep -E "Public Key Algorithm|Public-Key"

# whatever a live server is presenting
openssl s_client -connect example.com:443 -servername example.com </dev/null 2>/dev/null \
  | openssl x509 -noout -text | grep -E "Public Key Algorithm|Public-Key"

# an SSH key
ssh-keygen -lf ~/.ssh/id_rsa.pub

# a DKIM record (swap in your own selector and domain)
dig +short TXT selector1._domainkey.example.com | tr -d '" ' | sed 's/.*p=//;s/;.*//' \
  | base64 -d | openssl pkey -pubin -inform DER -noout -text | grep "Public-Key"
```

Anything RSA that comes back under 2048 bits is worth a look. If you see a 256-bit key and the algorithm says EC, that's fine - it's a different kind of key. Finding them is the easy part, though. The hard part is the stuff from the paragraph above: keys burned into hardware or baked into software that already shipped, where knowing about it doesn't mean you can actually change it.

As for the prediction itself, I don't think RSA-1024 falling in 2027 is far-fetched at all. $30M is a rounding error next to what AI companies already spend on compute, Lu thinks more optimization could cut that in half, and his run mostly happened on spare capacity anyway. The models doing the engineering are also getting better fast, which only pushes the price down further, and labs aren't the only ones with that kind of budget. 

Lu points out people were speculating the NSA could factor RSA-1024 as far back as the mid-2000s, and any government with a GPU budget can do it now without telling anyone - same story as the trading edges. So my real bet is that RSA-1024 gets factored next year, and the only question is whether we hear about it. Mass decryption of stored secrets, I still don't see happening, since every key is its own $15M to $30M job. If nobody spends the money, or the linear algebra step turns out to scale worse than Lu estimates, maybe I got a little ahead of myself on that one.

## First-party agent hookups

Last one: every program ends up with some kind of agent hookup, built and owned by the original vendor rather than bolted on by someone else.

Right now most of the glue between agents and software comes from outside: community MCP servers wrapped around someone else's API, or OS assistants hooking in through generic intents. That's already changing. Microsoft announced [native MCP support in Windows at Build 2025](https://blogs.windows.com/windowsdeveloper/2025/05/19/advancing-windows-for-ai-development-new-platform-capabilities-and-tools-introduced-at-build-2025/), and Hex-Rays shipped an official IDA MCP server the same week FLARE-On 13 opened, after the community's ida-pro-mcp had been doing that job for a year and a half ([I wrote about it here](/blog/flare-on-28-hours-to-one/)). 

I expect it to go all the way down, with vendors shipping their own agent interfaces, versioned and permissioned by them, because otherwise a third party owns the relationship between their software and their users' agents. At this rate, I can't see people putting up with software that won't take plain-English instructions and just do the thing.

You can see Microsoft laying that plumbing in smaller places too. [Windows Latest spotted](https://x.com/WindowsLatest/status/2107901472839286997) the new native Windows 11 Search picking up inline actions: turning on Bluetooth, Night Light or dark mode, muting, dimming the screen, snapping multiple application-specific windows, even sending a text to someone's phone - all straight from the search box. It's pitched as a search feature, not an agent one, but it's Windows exposing its own settings as named actions it controls, and to me, that sounds a lot like how an agent would work.

![Windows 11's new Search box with a Send message to Corey (Mobile) action open, typing 'text Corey I'm excited to see you all soon!' and hitting Send](/img/2027-predictions/windows-search-send-text.webp)

<small>Texting someone straight from the search box, via [Windows Latest](https://x.com/WindowsLatest/status/2107901472839286997).</small>

Security-wise, every one of those interfaces is a new privileged entry point that takes instructions derived from untrusted text. Prompt injection used to mean getting a chatbot to say something embarrassing. Once the agent can actually do things, it turns into a [confused deputy](https://en.wikipedia.org/wiki/Confused_deputy_problem) problem: someone hides instructions in an email or a webpage, and the agent carries them out with whatever permissions the vendor gave it. For game security, an agent interface on a game client or launcher is basically an **automation API**, and bot authors will be grateful for it.

Honestly, I'd be surprised if this doesn't become the norm. The one thing that could make it pointless is computer-use agents - the ones that just look at the screen and click around like a person would - getting good enough that nobody bothers building per-app integrations anymore. If that sounds familiar, it's the same thing CV cheats did to games: why bother hooking into the program when you can just read the screen?


## Going through your own list

If you actually made it this far, thank you. I know this one ran long - it started as a list of predictions with no reasoning and turned into a pretty big wall of reasoning. I appreciate you sticking with it. One last thing before you go.

Go through your own threat model and mark every control that works because an attacker's time is expensive: CAPTCHAs, rate limits that assume one human per account, obfuscation "nobody will bother with," a legacy key "nobody will spend the compute on," an unsupported box "nobody will write an exploit for." 

Then ask what happens to each one if that time gets ten times cheaper. Anything that only holds because the attack is **tedious** needs a different basis: identity, attestation, rotation, or just removing it outright.

I'm planning to come back to this next October and grade every one of these and see which ones landed and which ones didn't. If you already think I'm wrong about one, don't hesitate to tell me on [X](https://x.com/justmazz). I'm especially curious which one you think falls apart first, and I'd much rather hear it now than find out the hard way in a year lol.
