package server

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// Metrics holds all Prometheus metrics for the server
type Metrics struct {
	// Subscription metrics
	channelSubscribers *prometheus.GaugeVec
	threadSubscribers  *prometheus.GaugeVec

	// Broadcast metrics
	broadcastFanout    *prometheus.HistogramVec
	messagesDelivered  *prometheus.CounterVec
	messagesBroadcast  prometheus.Counter

	// Session metrics
	activeSessions      prometheus.Gauge
	sessionsCreated     prometheus.Counter
	sessionsDisconnected prometheus.Counter

	// Message type metrics
	messagesReceived *prometheus.CounterVec // by message type
	messagesSent     *prometheus.CounterVec // by message type

	// Performance metrics
	broadcastDuration *prometheus.HistogramVec
}

// NewMetrics creates a new metrics instance
func NewMetrics() *Metrics {
	return &Metrics{
		channelSubscribers: promauto.NewGaugeVec(
			prometheus.GaugeOpts{
				Name: "superchat_channel_subscribers",
				Help: "Number of active subscribers per channel",
			},
			[]string{"channel_id"},
		),
		threadSubscribers: promauto.NewGaugeVec(
			prometheus.GaugeOpts{
				Name: "superchat_thread_subscribers",
				Help: "Number of active subscribers per thread",
			},
			[]string{"thread_id"},
		),
		broadcastFanout: promauto.NewHistogramVec(
			prometheus.HistogramOpts{
				Name:    "superchat_broadcast_fanout",
				Help:    "Number of clients that received each broadcast message",
				Buckets: []float64{1, 5, 10, 25, 50, 100, 250, 500, 1000, 2000, 5000},
			},
			[]string{"type"}, // "channel" or "thread"
		),
		messagesDelivered: promauto.NewCounterVec(
			prometheus.CounterOpts{
				Name: "superchat_messages_delivered_total",
				Help: "Total number of messages delivered to clients",
			},
			[]string{"channel_id", "thread_id"},
		),
		messagesBroadcast: promauto.NewCounter(
			prometheus.CounterOpts{
				Name: "superchat_messages_broadcast_total",
				Help: "Total number of messages broadcast (unique messages, not deliveries)",
			},
		),
		activeSessions: promauto.NewGauge(
			prometheus.GaugeOpts{
				Name: "superchat_active_sessions",
				Help: "Current number of active sessions",
			},
		),
		sessionsCreated: promauto.NewCounter(
			prometheus.CounterOpts{
				Name: "superchat_sessions_created_total",
				Help: "Total number of sessions created",
			},
		),
		sessionsDisconnected: promauto.NewCounter(
			prometheus.CounterOpts{
				Name: "superchat_sessions_disconnected_total",
				Help: "Total number of sessions disconnected",
			},
		),
		messagesReceived: promauto.NewCounterVec(
			prometheus.CounterOpts{
				Name: "superchat_messages_received_total",
				Help: "Total number of messages received from clients by type",
			},
			[]string{"type"},
		),
		messagesSent: promauto.NewCounterVec(
			prometheus.CounterOpts{
				Name: "superchat_messages_sent_total",
				Help: "Total number of messages sent to clients by type",
			},
			[]string{"type"},
		),
		broadcastDuration: promauto.NewHistogramVec(
			prometheus.HistogramOpts{
				Name:    "superchat_broadcast_duration_seconds",
				Help:    "Time taken to broadcast a message to all subscribers",
				Buckets: prometheus.DefBuckets,
			},
			[]string{"type"},
		),
	}
}

// RecordChannelSubscribers updates the subscriber count for a channel
func (m *Metrics) RecordChannelSubscribers(channelID uint64, count int) {
	m.channelSubscribers.WithLabelValues(uint64ToString(channelID)).Set(float64(count))
}

// RecordThreadSubscribers updates the subscriber count for a thread
func (m *Metrics) RecordThreadSubscribers(threadID uint64, count int) {
	m.threadSubscribers.WithLabelValues(uint64ToString(threadID)).Set(float64(count))
}

// RecordBroadcastFanout records how many clients received a broadcast
func (m *Metrics) RecordBroadcastFanout(broadcastType string, recipientCount int) {
	m.broadcastFanout.WithLabelValues(broadcastType).Observe(float64(recipientCount))
}

// RecordMessageDelivered increments the delivery counter for a channel/thread
func (m *Metrics) RecordMessageDelivered(channelID uint64, threadID *uint64) {
	threadIDStr := "none"
	if threadID != nil {
		threadIDStr = uint64ToString(*threadID)
	}
	m.messagesDelivered.WithLabelValues(uint64ToString(channelID), threadIDStr).Inc()
}

// RecordMessageBroadcast increments the broadcast counter
func (m *Metrics) RecordMessageBroadcast() {
	m.messagesBroadcast.Inc()
}

// RecordActiveSessions updates the active session count
func (m *Metrics) RecordActiveSessions(count int) {
	m.activeSessions.Set(float64(count))
}

// RecordBroadcastDuration records how long a broadcast took
func (m *Metrics) RecordBroadcastDuration(broadcastType string, durationSeconds float64) {
	m.broadcastDuration.WithLabelValues(broadcastType).Observe(durationSeconds)
}

// RecordSessionCreated increments the session creation counter
func (m *Metrics) RecordSessionCreated() {
	m.sessionsCreated.Inc()
}

// RecordSessionDisconnected increments the session disconnection counter
func (m *Metrics) RecordSessionDisconnected() {
	m.sessionsDisconnected.Inc()
}

// RecordMessageReceived increments the message received counter for a type
func (m *Metrics) RecordMessageReceived(messageType string) {
	m.messagesReceived.WithLabelValues(messageType).Inc()
}

// RecordMessageSent increments the message sent counter for a type
func (m *Metrics) RecordMessageSent(messageType string) {
	m.messagesSent.WithLabelValues(messageType).Inc()
}

// Helper to convert uint64 to string for labels
func uint64ToString(n uint64) string {
	if n == 0 {
		return "0"
	}
	// Simple conversion without fmt to avoid allocation
	var buf [20]byte
	i := len(buf) - 1
	for n > 0 {
		buf[i] = byte('0' + n%10)
		n /= 10
		i--
	}
	return string(buf[i+1:])
}

// Helper to convert message type to string
func messageTypeToString(msgType uint8) string {
	switch msgType {
	case 0x01:
		return "SET_NICKNAME"
	case 0x02:
		return "LIST_CHANNELS"
	case 0x03:
		return "JOIN_CHANNEL"
	case 0x04:
		return "LEAVE_CHANNEL"
	case 0x05:
		return "LIST_MESSAGES"
	case 0x06:
		return "POST_MESSAGE"
	case 0x07:
		return "DELETE_MESSAGE"
	case 0x08:
		return "PING"
	case 0x09:
		return "DISCONNECT"
	case 0x51:
		return "SUBSCRIBE_THREAD"
	case 0x52:
		return "UNSUBSCRIBE_THREAD"
	case 0x53:
		return "SUBSCRIBE_CHANNEL"
	case 0x54:
		return "UNSUBSCRIBE_CHANNEL"
	case 0x90:
		return "NICKNAME_RESPONSE"
	case 0x91:
		return "ERROR"
	case 0x92:
		return "CHANNEL_LIST"
	case 0x93:
		return "JOIN_RESPONSE"
	case 0x94:
		return "MESSAGE_LIST"
	case 0x95:
		return "MESSAGE_POSTED"
	case 0x96:
		return "NEW_MESSAGE"
	case 0x97:
		return "MESSAGE_DELETED"
	case 0x98:
		return "SERVER_CONFIG"
	case 0x99:
		return "SUBSCRIBE_OK"
	default:
		return "UNKNOWN"
	}
}
