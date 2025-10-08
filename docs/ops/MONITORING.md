# SuperChat Monitoring Guide

Complete guide for monitoring and observability of SuperChat servers.

## Table of Contents

- [Overview](#overview)
- [Log Files](#log-files)
- [Prometheus Metrics](#prometheus-metrics)
- [Grafana Setup](#grafana-setup)
- [Alert Rules](#alert-rules)
- [Health Checks](#health-checks)
- [Performance Profiling](#performance-profiling)
- [Log Aggregation](#log-aggregation)
- [Common Patterns](#common-patterns)

## Overview

SuperChat provides multiple monitoring mechanisms:

1. **Log files** - Server activity, errors, debug info
2. **Prometheus metrics** - Real-time performance metrics (port 9090)
3. **Health endpoint** - Simple health check HTTP endpoint
4. **pprof** - CPU and memory profiling (port 6060)

**Critical Security Note:** Ports 9090 (metrics) and 6060 (pprof) must **NEVER** be exposed publicly. Use firewall rules and SSH tunneling for access.

## Log Files

SuperChat writes three log files:

### server.log

**Location:** `~/.local/share/superchat/server.log` or `$XDG_DATA_HOME/superchat/server.log`

**Contents:** All server activity (connections, messages, errors)

**Rotation:** Truncated on each server startup

**Format:**
```
2025/10/08 14:30:15.123456 [INFO] Server started on port 6465
2025/10/08 14:30:20.234567 [INFO] Connection from 192.168.1.100:54321
2025/10/08 14:30:21.345678 [INFO] Session 1 set nickname: alice
2025/10/08 14:30:25.456789 [ERROR] Rate limit exceeded for session 2
```

**Monitoring:**
```bash
# Tail logs in real-time
tail -f ~/.local/share/superchat/server.log

# Search for errors
grep ERROR ~/.local/share/superchat/server.log

# Count connections today
grep "Connection from" ~/.local/share/superchat/server.log | wc -l

# Find rate limit violations
grep "rate limit exceeded" ~/.local/share/superchat/server.log
```

### errors.log

**Location:** `~/.local/share/superchat/errors.log`

**Contents:** Error-level logs only

**Rotation:** Append mode, persists across restarts

**Use case:** Long-term error tracking, debugging intermittent issues

**Monitoring:**
```bash
# Check recent errors
tail -n 50 ~/.local/share/superchat/errors.log

# Count errors today
grep "$(date +%Y/%m/%d)" ~/.local/share/superchat/errors.log | wc -l

# Find specific error patterns
grep "database" ~/.local/share/superchat/errors.log
```

### debug.log

**Location:** `~/.local/share/superchat/debug.log`

**Contents:** Debug-level logs (only when `--debug` flag is used)

**Rotation:** Append mode

**Use case:** Development, troubleshooting complex issues

**Enable debug logging:**
```bash
scd --debug
```

**Warning:** Debug logs can grow quickly and may contain sensitive information. Only enable when needed.

### systemd Journal

If using systemd, logs are also sent to the journal:

```bash
# View all SuperChat logs
sudo journalctl -u superchat

# Follow logs in real-time
sudo journalctl -u superchat -f

# Last 100 lines
sudo journalctl -u superchat -n 100

# Since specific time
sudo journalctl -u superchat --since "2025-10-08 14:00:00"

# Only errors
sudo journalctl -u superchat -p err

# JSON output (for parsing)
sudo journalctl -u superchat -o json
```

## Prometheus Metrics

SuperChat exposes Prometheus metrics on **port 9090** at `/metrics`.

**Critical:** This port must be firewalled! Access via SSH tunnel only.

### Accessing Metrics

**Local access (on server):**
```bash
curl http://localhost:9090/metrics
```

**Remote access (via SSH tunnel):**
```bash
# From your local machine
ssh -L 9090:localhost:9090 user@server

# Then access locally
curl http://localhost:9090/metrics
```

### Available Metrics

#### Session Metrics

**`superchat_active_sessions`** (Gauge)
- Current number of active sessions
- Use: Monitor concurrent user count
- Alert: Spike may indicate DoS attack or viral growth

**`superchat_sessions_created_total`** (Counter)
- Total sessions created since server start
- Use: Track total connections over time
- Rate: `rate(superchat_sessions_created_total[5m])` = sessions/second

**`superchat_sessions_disconnected_total`** (Counter)
- Total sessions disconnected
- Use: Track disconnect rate
- Alert: High rate may indicate connectivity issues

#### Message Metrics

**`superchat_messages_received_total{type="..."}` (Counter)**
- Total messages received from clients by type
- Labels: `type` (SET_NICKNAME, POST_MESSAGE, etc.)
- Use: Track message volume by type
- Example types: `POST_MESSAGE`, `PING`, `LIST_MESSAGES`

**`superchat_messages_sent_total{type="..."}` (Counter)**
- Total messages sent to clients by type
- Labels: `type` (MESSAGE_LIST, NEW_MESSAGE, ERROR, etc.)
- Use: Track server responses by type

**`superchat_messages_broadcast_total`** (Counter)
- Total unique messages broadcast (not deliveries)
- Use: Track actual message creation rate
- Rate: `rate(superchat_messages_broadcast_total[5m])` = messages/second

**`superchat_messages_delivered_total{channel_id="...",thread_id="..."}` (Counter)**
- Total message deliveries to clients
- Labels: `channel_id`, `thread_id`
- Use: Track message delivery volume per channel/thread
- Note: One broadcast = N deliveries (N = subscriber count)

#### Subscription Metrics

**`superchat_channel_subscribers{channel_id="..."}` (Gauge)**
- Active subscribers per channel
- Labels: `channel_id`
- Use: Monitor channel popularity
- Alert: Sudden spike in one channel = possible spam attack

**`superchat_thread_subscribers{thread_id="..."}` (Gauge)**
- Active subscribers per thread
- Labels: `thread_id`
- Use: Track thread engagement

#### Broadcast Metrics

**`superchat_broadcast_fanout{type="..."}` (Histogram)**
- Number of recipients per broadcast message
- Labels: `type` (channel or thread)
- Buckets: 1, 5, 10, 25, 50, 100, 250, 500, 1000, 2000, 5000
- Use: Understand broadcast reach
- Query: `histogram_quantile(0.95, superchat_broadcast_fanout_bucket)` = 95th percentile fanout

**`superchat_broadcast_duration_seconds{type="..."}` (Histogram)**
- Time taken to broadcast a message to all subscribers
- Labels: `type` (channel or thread)
- Use: Monitor broadcast performance
- Alert: P95 > 1s = performance issue
- Query: `histogram_quantile(0.95, rate(superchat_broadcast_duration_seconds_bucket[5m]))`

#### Go Runtime Metrics (Built-in)

**`go_goroutines`** (Gauge)
- Current number of goroutines
- Use: Detect goroutine leaks
- Alert: Continuously increasing = leak

**`go_memstats_alloc_bytes`** (Gauge)
- Bytes of allocated heap memory
- Use: Monitor memory usage

**`go_memstats_heap_inuse_bytes`** (Gauge)
- Bytes in in-use heap spans
- Use: Monitor heap size

**`process_cpu_seconds_total`** (Counter)
- Total CPU time consumed
- Use: Calculate CPU usage percentage
- Query: `rate(process_cpu_seconds_total[5m]) * 100` = CPU %

**`process_resident_memory_bytes`** (Gauge)
- Resident memory size (RSS)
- Use: Monitor overall memory usage

### Example Queries

**Active users:**
```promql
superchat_active_sessions
```

**Message rate (messages per second):**
```promql
rate(superchat_messages_broadcast_total[5m])
```

**Connection rate (new sessions per minute):**
```promql
rate(superchat_sessions_created_total[1m]) * 60
```

**Average broadcast fanout:**
```promql
rate(superchat_messages_delivered_total[5m]) / rate(superchat_messages_broadcast_total[5m])
```

**P95 broadcast latency:**
```promql
histogram_quantile(0.95, rate(superchat_broadcast_duration_seconds_bucket[5m]))
```

**CPU usage:**
```promql
rate(process_cpu_seconds_total[5m]) * 100
```

**Memory usage (MB):**
```promql
process_resident_memory_bytes / 1024 / 1024
```

**Goroutine leak detection:**
```promql
deriv(go_goroutines[5m])  # Positive value = increasing goroutines
```

## Grafana Setup

### Installation

**Ubuntu/Debian:**
```bash
sudo apt-get install -y software-properties-common
sudo add-apt-repository "deb https://packages.grafana.com/oss/deb stable main"
wget -q -O - https://packages.grafana.com/gpg.key | sudo apt-key add -
sudo apt-get update
sudo apt-get install grafana
sudo systemctl enable grafana-server
sudo systemctl start grafana-server
```

**Docker:**
```bash
docker run -d \
  --name=grafana \
  -p 3000:3000 \
  grafana/grafana-oss
```

**Access:** http://localhost:3000 (default login: admin/admin)

### Prometheus Data Source

1. Navigate to **Configuration → Data Sources**
2. Click **Add data source**
3. Select **Prometheus**
4. Set URL: `http://localhost:9090` (or SSH tunnel)
5. Click **Save & Test**

### Dashboard Creation

**Create a new dashboard:**

1. Click **+ → Create Dashboard**
2. Add panels with queries:

**Panel: Active Sessions**
- Query: `superchat_active_sessions`
- Visualization: Stat or Time series
- Unit: Short

**Panel: Message Rate**
- Query: `rate(superchat_messages_broadcast_total[5m])`
- Visualization: Graph
- Unit: Messages/sec

**Panel: Broadcast Latency (P95)**
- Query: `histogram_quantile(0.95, rate(superchat_broadcast_duration_seconds_bucket[5m]))`
- Visualization: Graph
- Unit: Seconds
- Threshold: Warning at 0.5s, Critical at 1s

**Panel: CPU Usage**
- Query: `rate(process_cpu_seconds_total[5m]) * 100`
- Visualization: Gauge
- Unit: Percent (0-100)
- Threshold: Warning at 70%, Critical at 90%

**Panel: Memory Usage**
- Query: `process_resident_memory_bytes / 1024 / 1024`
- Visualization: Gauge
- Unit: MB

**Panel: Connection Rate**
- Query: `rate(superchat_sessions_created_total[5m]) * 60`
- Visualization: Graph
- Unit: Connections/min

**Panel: Top Channels by Subscribers**
- Query: `topk(10, superchat_channel_subscribers)`
- Visualization: Bar chart

**Panel: Goroutine Count**
- Query: `go_goroutines`
- Visualization: Graph
- Alert: Continuously increasing

### Sample Dashboard JSON

Save this as `superchat-dashboard.json` and import into Grafana:

```json
{
  "dashboard": {
    "title": "SuperChat Server Metrics",
    "panels": [
      {
        "title": "Active Sessions",
        "targets": [{"expr": "superchat_active_sessions"}],
        "type": "stat"
      },
      {
        "title": "Message Rate",
        "targets": [{"expr": "rate(superchat_messages_broadcast_total[5m])"}],
        "type": "graph"
      },
      {
        "title": "Broadcast Latency P95",
        "targets": [{"expr": "histogram_quantile(0.95, rate(superchat_broadcast_duration_seconds_bucket[5m]))"}],
        "type": "graph"
      }
    ]
  }
}
```

## Alert Rules

### Prometheus Alert Configuration

Create `prometheus/alerts.yml`:

```yaml
groups:
  - name: superchat_alerts
    interval: 30s
    rules:
      # Server down
      - alert: SuperChatServerDown
        expr: up{job="superchat"} == 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "SuperChat server is down"
          description: "No metrics received for 5 minutes"

      # High connection rate (possible DoS)
      - alert: HighConnectionRate
        expr: rate(superchat_sessions_created_total[1m]) > 100
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High connection rate detected"
          description: "{{ $value }} connections/sec (threshold: 100)"

      # High error rate
      - alert: HighErrorRate
        expr: |
          sum(rate(superchat_messages_sent_total{type="ERROR"}[5m])) /
          sum(rate(superchat_messages_received_total[5m])) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate (>10%)"
          description: "{{ $value | humanizePercentage }} of messages are errors"

      # High broadcast latency
      - alert: HighBroadcastLatency
        expr: histogram_quantile(0.95, rate(superchat_broadcast_duration_seconds_bucket[5m])) > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High broadcast latency"
          description: "P95 broadcast latency: {{ $value }}s (threshold: 1s)"

      # Database size growing rapidly
      - alert: DatabaseGrowthRapid
        expr: |
          predict_linear(
            process_resident_memory_bytes[1h], 24*3600
          ) > 16 * 1024 * 1024 * 1024
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Database growing rapidly"
          description: "Projected to reach 16GB in 24 hours"

      # Goroutine leak
      - alert: GoroutineLeakSuspected
        expr: deriv(go_goroutines[10m]) > 0.5
        for: 30m
        labels:
          severity: warning
        annotations:
          summary: "Possible goroutine leak"
          description: "Goroutine count increasing: {{ $value }}/sec"

      # Active sessions near capacity
      - alert: SessionsNearCapacity
        expr: superchat_active_sessions > 9000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Active sessions near tested limit"
          description: "{{ $value }} active sessions (tested max: 10k)"

      # CPU usage high
      - alert: HighCPUUsage
        expr: rate(process_cpu_seconds_total[5m]) * 100 > 80
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High CPU usage"
          description: "CPU usage: {{ $value }}% (threshold: 80%)"
```

### Alertmanager Configuration

Create `alertmanager/config.yml`:

```yaml
global:
  resolve_timeout: 5m

route:
  group_by: ['alertname', 'severity']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h
  receiver: 'default'

receivers:
  - name: 'default'
    email_configs:
      - to: 'admin@example.com'
        from: 'alertmanager@example.com'
        smarthost: 'smtp.example.com:587'
        auth_username: 'alertmanager@example.com'
        auth_password: 'password'

  - name: 'slack'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL'
        channel: '#superchat-alerts'
        title: 'SuperChat Alert'
        text: '{{ range .Alerts }}{{ .Annotations.summary }}\n{{ end }}'

  - name: 'pagerduty'
    pagerduty_configs:
      - service_key: 'YOUR_PAGERDUTY_KEY'
```

## Health Checks

### HTTP Health Endpoint

**Endpoint:** `http://localhost:9090/health`

**Response (healthy):**
```json
{
  "status": "ok",
  "uptime": 12345,
  "sessions": 42,
  "database": "ok",
  "directory_enabled": true
}
```

**Use cases:**
- Load balancer health checks
- Monitoring system checks
- Kubernetes liveness/readiness probes

### Health Check Script

Create `healthcheck.sh`:

```bash
#!/bin/bash
# SuperChat health check script

set -e

# Check if server is listening on TCP port
if ! nc -z localhost 6465; then
  echo "ERROR: Server not listening on port 6465"
  exit 1
fi

# Check health endpoint
RESPONSE=$(curl -sf http://localhost:9090/health || echo "")
if [ -z "$RESPONSE" ]; then
  echo "ERROR: Health endpoint not responding"
  exit 1
fi

# Parse JSON response
STATUS=$(echo "$RESPONSE" | jq -r '.status')
DB_STATUS=$(echo "$RESPONSE" | jq -r '.database')

if [ "$STATUS" != "ok" ]; then
  echo "ERROR: Server status: $STATUS"
  exit 1
fi

if [ "$DB_STATUS" != "ok" ]; then
  echo "ERROR: Database status: $DB_STATUS"
  exit 1
fi

echo "OK: SuperChat server is healthy"
exit 0
```

**Usage:**
```bash
chmod +x healthcheck.sh
./healthcheck.sh
```

### Kubernetes Probes

```yaml
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: superchat
    image: superchat:latest
    ports:
    - containerPort: 6465
    - containerPort: 9090
    livenessProbe:
      httpGet:
        path: /health
        port: 9090
      initialDelaySeconds: 10
      periodSeconds: 30
    readinessProbe:
      httpGet:
        path: /health
        port: 9090
      initialDelaySeconds: 5
      periodSeconds: 10
```

## Performance Profiling

SuperChat exposes pprof endpoints on **port 6060**.

**Critical:** This port must NEVER be exposed publicly!

### Accessing pprof

**Via SSH tunnel:**
```bash
# From your local machine
ssh -L 6060:localhost:6060 user@server

# Access pprof endpoints
open http://localhost:6060/debug/pprof/
```

### Available Profiles

**CPU Profile (30 seconds):**
```bash
go tool pprof http://localhost:6060/debug/pprof/profile?seconds=30
```

**Heap Profile:**
```bash
go tool pprof http://localhost:6060/debug/pprof/heap
```

**Goroutine Profile:**
```bash
go tool pprof http://localhost:6060/debug/pprof/goroutine
```

**Allocs Profile (memory allocations):**
```bash
go tool pprof http://localhost:6060/debug/pprof/allocs
```

**Block Profile (blocking operations):**
```bash
go tool pprof http://localhost:6060/debug/pprof/block
```

### Interactive pprof

```bash
# Capture CPU profile
go tool pprof http://localhost:6060/debug/pprof/profile?seconds=30

# Interactive commands:
(pprof) top10      # Show top 10 functions by CPU time
(pprof) list main  # Show source code with line-by-line profile
(pprof) web        # Generate call graph (requires graphviz)
(pprof) pdf        # Save call graph as PDF
```

### Flame Graphs

```bash
# Install go-torch (flame graph tool)
go install github.com/uber/go-torch@latest

# Generate flame graph
go-torch -u http://localhost:6060 -t 30
```

## Log Aggregation

### syslog Integration

SuperChat logs to systemd journal, which can forward to syslog.

**Forward to remote syslog:**
```bash
# /etc/rsyslog.d/superchat.conf
:programname, isequal, "scd" @@remote-syslog-server:514
```

### logrotate Configuration

Create `/etc/logrotate.d/superchat`:

```
/var/lib/superchat/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 640 superchat superchat
    postrotate
        systemctl reload superchat > /dev/null 2>&1 || true
    endscript
}
```

### ELK Stack Integration

**Filebeat configuration** (`/etc/filebeat/filebeat.yml`):

```yaml
filebeat.inputs:
  - type: log
    enabled: true
    paths:
      - /var/lib/superchat/server.log
      - /var/lib/superchat/errors.log
    fields:
      app: superchat
      type: server_log

output.elasticsearch:
  hosts: ["localhost:9200"]
  index: "superchat-%{+yyyy.MM.dd}"
```

## Common Patterns

### Detecting DoS Attacks

```bash
# High connection rate from single IP
curl -s http://localhost:9090/metrics | grep superchat_sessions_created_total | awk '{print $2}'

# Check if rate is increasing rapidly
# Compare values 1 minute apart
```

### Identifying Spam Users

```bash
# Top message senders (requires log analysis)
grep "POST_MESSAGE" ~/.local/share/superchat/server.log | \
  awk '{print $4}' | sort | uniq -c | sort -rn | head -10
```

### Monitoring Database Growth

```bash
# Database file size
du -h ~/.local/share/superchat/superchat.db

# Track growth over time
watch -n 60 'du -h ~/.local/share/superchat/superchat.db'
```

### Analyzing Broadcast Performance

```promql
# Average fanout per broadcast type
avg by (type) (superchat_broadcast_fanout)

# P99 broadcast latency
histogram_quantile(0.99, rate(superchat_broadcast_duration_seconds_bucket[5m]))
```

### Finding Memory Leaks

```bash
# Capture heap profile every 10 minutes
while true; do
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  go tool pprof -text http://localhost:6060/debug/pprof/heap > heap_$TIMESTAMP.txt
  sleep 600
done

# Compare heap profiles
go tool pprof -base heap_20250108_140000.txt heap_20250108_150000.txt
```

## Next Steps

- [DEPLOYMENT.md](DEPLOYMENT.md) - Server deployment guide
- [CONFIGURATION.md](CONFIGURATION.md) - Configuration reference
- [SECURITY.md](SECURITY.md) - Security hardening
- [BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md) - Backup strategies
