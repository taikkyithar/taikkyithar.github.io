---
layout: post
title: "I rebuilt my homelab from scratch — with one command"
date: 2026-07-02 09:00:00 +0630
description: "A dead SSD forced the question every homelab eventually asks: could you actually rebuild this? Here's how I made the answer yes."
tags: [homelab, ansible, automation]
---

An SSD died in my homelab last month. Nothing important was lost — backups did their job —
but it forced the question every homelab eventually asks:

> If this box disappeared tonight, how long until it's back?

My honest answer was "a weekend, and I'd forget something." That wasn't good enough, so I
spent a week making the answer `ansible-playbook site.yml`.

## The problem with pet servers

My lab had drifted for years. Packages installed at 1am and never documented. A cron job I
couldn't explain. Three different ways of managing DNS records because I'd changed my mind
twice.

None of it was written down, which meant **the server itself was the only documentation** —
and that documentation had just died with the SSD.

## One role per concern

The rebuild is boring by design. Every service is a role, every role is idempotent:

```
roles/
  common/       # users, ssh hardening, unattended-upgrades
  docker/       # engine + compose plugin
  dns/          # pihole + unbound
  monitoring/   # prometheus, grafana, node_exporter
  backup/       # restic + systemd timers
```

```yaml
# site.yml
- hosts: lab
  become: true
  roles:
    - common
    - docker
    - dns
    - monitoring
    - backup
```

Nothing clever. The value isn't in the Ansible — it's in the fact that every decision now
lives in a file I can read, diff, and revert.

## Secrets stay out of git

```bash
ansible-vault encrypt group_vars/lab/vault.yml
```

Encrypted vars, committed alongside everything else. One password in my password manager
unlocks the whole lab. The alternative — secrets scattered across shell history and config
files — is how the drift started in the first place.

## What actually changed

The rebuild itself took 14 minutes. But the real win wasn't speed.

It's that I now change infrastructure the way I change code: edit, review the diff, apply,
and roll back if it's wrong. **When your infrastructure is a file, "what did I change?" is
a question with an answer.**

The next dead SSD is a coffee break, not a weekend.
