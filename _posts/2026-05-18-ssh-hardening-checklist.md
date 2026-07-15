---
layout: post
title: "An SSH hardening checklist I actually use"
date: 2026-05-18 09:00:00 +0630
description: "Every public-facing box gets the same treatment: keys only, no root, a non-standard surface, and fail2ban watching the door."
tags: [linux, security]
---

Every server I put on the public internet gets the same treatment before it does anything
useful. It takes about ten minutes and it removes the overwhelming majority of the noise
you'd otherwise see in your auth logs.

## Keys only, no passwords

This is the one that matters most. Password auth means brute force is always on the table.

```
# /etc/ssh/sshd_config
PasswordAuthentication no
PubkeyAuthentication yes
ChallengeResponseAuthentication no
```

Before you reload `sshd`, **open a second session and confirm your key works.** Locking
yourself out of a remote box is a rite of passage, but it's an avoidable one.

## Don't log in as root

Give yourself a normal user with `sudo` and disable direct root login:

```
PermitRootLogin no
AllowUsers deploy
```

`AllowUsers` is the underrated half of this. An explicit allowlist means a newly created
system account can't become an SSH entry point by accident.

## Shrink the attack surface

```
Protocol 2
X11Forwarding no
AllowAgentForwarding no
MaxAuthTries 3
LoginGraceTime 20
```

Agent forwarding in particular is worth disabling unless you specifically need it — anyone
with root on the box you're connected to can use your forwarded agent.

## Let fail2ban do the boring part

```bash
sudo apt install fail2ban
sudo systemctl enable --now fail2ban
```

The stock `sshd` jail is fine. It won't stop a targeted attacker, but it turns your logs
from thousands of lines of drive-by attempts into something you can actually read — and
logs you can read are logs you'll actually look at.

## Verify, don't assume

```bash
sudo sshd -t                    # config syntax check — always run before reload
sudo systemctl reload sshd
ssh -o PasswordAuthentication=yes user@host   # should be rejected
```

That last line is the part people skip. A hardening step you haven't tested is a hardening
step you're only assuming you have.
