# Cron Manager

Centralized scheduler for all timed jobs across the system. Manages daily, weekly, monthly, and custom cron schedules with persistent state tracking.

## Role
- Register and manage scheduled jobs (daily brief, overnight research, data sync, etc.)
- Track job state: active, paused, running, completed, failed
- Support frequencies: once, daily, weekly, monthly, custom cron expressions
- Persist job state across restarts
- Provide status for UI display
- Handle job execution and error recovery

## Philosophy
Reliable scheduling is the backbone of automation. Every job runs on time, every failure is logged, every state is persisted.
