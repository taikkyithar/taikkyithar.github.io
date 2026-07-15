---
layout: post
title: "Prometheus alerts that don't cry wolf"
date: 2026-06-09 09:00:00 +0630
description: "An alert nobody trusts is worse than no alert at all. Three rules I use to keep every page meaningful."
tags: [monitoring, prometheus, sre]
---

The fastest way to make monitoring useless is to alert on everything. Once people start
muting your channel, you've lost — the one page that mattered is buried under forty that
didn't.

Here's the filter I run every alert through.

## 1. Alert on symptoms, not causes

High CPU is not a problem. High CPU *while users are getting 503s* is a problem. High CPU
during a nightly batch job is Tuesday.

```yaml
# Bad — fires constantly, tells you nothing actionable
- alert: HighCPU
  expr: node_cpu_seconds_total > 0.9

# Better — describes something a user would actually notice
- alert: HighErrorRate
  expr: |
    sum(rate(http_requests_total{status=~"5.."}[5m]))
      / sum(rate(http_requests_total[5m])) > 0.05
  for: 10m
  labels:
    severity: page
  annotations:
    summary: "5xx rate above 5% for 10 minutes"
```

If the alert doesn't map to something a user or a downstream service can feel, it belongs
on a dashboard, not in a pager.

## 2. Always use `for:`

A metric that crosses a threshold for eight seconds is noise. `for: 10m` means "this has
been sustained long enough to be real." It's a single line and it removes most flapping.

## 3. Every alert needs a runbook

If the person woken at 3am can't tell what to *do* from the annotation, the alert is
incomplete:

```yaml
  annotations:
    summary: "5xx rate above 5% for 10 minutes"
    description: "Check recent deploys, then upstream DB latency."
    runbook_url: "https://wiki.internal/runbooks/high-error-rate"
```

## The test

The question I ask before shipping any rule:

> If this fires at 3am, would I want to be woken up?

If the answer is no, it's not a page. Make it a ticket, put it on a dashboard, or delete
it. **Severity is a promise about urgency** — the moment you break that promise, every
alert you've ever written gets a little less credible.
