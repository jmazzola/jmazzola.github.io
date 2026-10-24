---
title: "flare-on 13 write-ups: all nine challenges, with AI in the loop"
description: "full walkthroughs of all nine flare-on 13 challenges from my sol 6 run: what each was, how the models solved it, and where I stepped in."
date: 2026-10-23
category: re-with-ai
---

When I [posted my FLARE-On 13 numbers](/blog/flare-on-28-hours-to-one/) a couple weeks ago, I left the actual challenges out, because the contest was still running and the rules are no public write-ups until it closes. It closed on the 23rd. So here's the other half: what all nine were, and how an AI-assisted run got through them.

Short recap if you skipped the first post. I ran [FLARE-On 13](https://flare-on.com/) the night of October 6th as a single prompt to [omp](https://github.com/can1357/oh-my-pi), which drove OpenAI's Sol 6 and a pile of its own RE subagents through all nine, start to finish, in about four and a half hours. My job was to watch, log into a browser tab when it asked, point it at my IDA install once, and pull it out of a rabbit hole when it got stuck. 17 times, if you're counting. My buddy [Truix](https://x.com/truix_) ran the same nine on Opus 5 and 5.5, and Meta's Muse ran them too, [which got its own post](/blog/muse-wonder-full-flare-on/).

Fair warning on format: these are not the usual  "here's the trick" CTF write-ups. 

Each one is a full walkthrough of its challenge, start to finish - the disassembly, the exact commands, the tables, and the dead ends - built from what the models actually did and where I had to step in. 

The accepted flag at the end of each page is blurred until you click it, so you or your agents can try the challenge first without spoilers :3

A couple of things up front so each page doesn't repeat them: 

* every archive's password is `flare`
* the commands run from the challenge's extracted folder, and I never patch the original binary - IDA and every script run on a copy.
* &#32;Paths like `re-analysis/...` are scripts and dumps Sol saved during the run, so I showed what they do rather than just hand you a repo. 

With all that being said, let's get into the writeups!

## Challenge 1: FLAreCAPTCHA

<small class="writeup-stat">Me on Sol 6: 6:27, 2.11M tokens, $0.63, stepped in twice.<br>Truix on Opus 5.5: 16:51, 1.65M tokens, $1.15, stepped in 8 times.<br>~8 min read.</small>

A fake reCAPTCHA that only accepts a held right-click, and builds the flag out of what looks like layout math. [Read the walkthrough →](/blog/flare-on-13-writeups/flarecaptcha/)

## Challenge 2: GhostStream

<small class="writeup-stat">Me on Sol 6: 14:28, 18.64M tokens, $4.89, stepped in 3 times.<br>Truix on Opus 5.5: 4:41, 2.85M tokens, $1.50, stepped in once.<br>~12 min read.</small>

A WIM with an NTFS alternate data stream, a seven-day gate, and a child process that sabotages its own strlen. [Read the walkthrough →](/blog/flare-on-13-writeups/ghoststream/)

## Challenge 3: FlareOn13.doc

<small class="writeup-stat">Me on Sol 6: 10:09, 36.67M tokens, $9.73, didn't step in.<br>Truix on Opus 5.5: 5:31, 9.61M tokens, $4.13, didn't step in.<br>~11 min read.</small>

One file that is a PDF, a raw CD image, a UDF volume, a ZIP and a fat Mach-O at once, with six clues feeding one key. [Read the walkthrough →](/blog/flare-on-13-writeups/flareon13-doc/)

## Challenge 4: ToxicMiner

<small class="writeup-stat">Me on Sol 6: 15:34, 51.36M tokens, $12.74, didn't step in.<br>Truix on Opus 5.5: 10:35, 8.60M tokens, $2.65, stepped in twice, 1 refusal.<br>~13 min read.</small>

A cpuminer fork hiding an almost-SHA-256 that hashes your volume serial, with the missing serial brute-forced on the GPU. [Read the walkthrough →](/blog/flare-on-13-writeups/toxicminer/)

## Challenge 5: catthief

<small class="writeup-stat">Me on Sol 6: 7:03, 18.22M tokens, $4.66, didn't step in.<br>Truix on Opus 5.5: 3:37, 6.15M tokens, $1.63, stepped in once.<br>~11 min read.</small>

RC4 that restarts for every HTTP body, a custom Huffman, and five JPEGs with the flag written on a pirate scroll. [Read the walkthrough →](/blog/flare-on-13-writeups/catthief/)

## Challenge 6: Threat Invaders

<small class="writeup-stat">Me on Sol 6: 25:58, 77.55M tokens, $19.89, didn't step in.<br>Truix on Opus 5.5: 7:01, 12.81M tokens, $3.78, stepped in 6 times, 3 refusals.<br>~13 min read.</small>

An impossible telemetry length that gives away a patched .NET runtime hooking the game's own methods from native code. [Read the walkthrough →](/blog/flare-on-13-writeups/threat-invaders/)

## Challenge 7: FlareCalc

<small class="writeup-stat">Me on Sol 6, Astra, and jev-latest: 57:51, 218.01M tokens, $50.49, stepped in 7 times, 3 refusals.<br>Truix on Opus 5 and 5.5: 50:13, 73.41M tokens, $43.05, stepped in 30 times, ~25 refusals.<br>~15 min read.</small>

Executable code hidden in the PE's signing certificate, a little VM, and a network rabbit hole that turned out to solve offline. [Read the walkthrough →](/blog/flare-on-13-writeups/flarecalc/)

## Challenge 8: crux

<small class="writeup-stat">Me on Sol 6: 39:56, 109.95M tokens, $26.28, stepped in once.<br>Truix on Opus 5 and 5.5: 41:37, 152.54M tokens, $99.45, stepped in 13 times, 1 refusal.<br>~11 min read.</small>

A Go-to-WASM browser extension whose "one little input string" is a 3,891-byte recursive Pratt primality certificate. [Read the walkthrough →](/blog/flare-on-13-writeups/crux/)

## Challenge 9: NeonOutRun

<small class="writeup-stat">Me on Sol 6: 1:33:30, 206.77M tokens, $50.34, stepped in 4 times.<br>Truix on Opus 5: 33:38, 172.66M tokens, $112.71, stepped in 6 times, 1 refusal.<br>~15 min read.</small>

A neon racer whose victory flag is a decoy, with the real one encoded in three monkey-patched V8 builtins. [Read the walkthrough →](/blog/flare-on-13-writeups/neonoutrun/)

## The two that hurt

If there's a thread through the nine, it's that the two that cost the most time, FlareCalc and NeonOutRun, both hid the real work somewhere the obvious code didn't point: executable bytes tucked into a signing certificate, and three monkey-patched V8 builtins. The easy ones barely slowed the models down; those two ate most of my night and most of my 17 interventions.

The numbers, mine next to Truix's, are back in the [first post](/blog/flare-on-28-hours-to-one/), and Muse ran the same nine in [its own post](/blog/muse-wonder-full-flare-on/).
