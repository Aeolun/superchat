package main

import (
	"flag"
	"fmt"
	"log"
	"math/rand"
	"os"
	"os/signal"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/aeolun/superchat/pkg/client"
	"github.com/aeolun/superchat/pkg/protocol"
)

const loremIpsum = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."

var loremWords []string
var usernameWords []string

func init() {
	// Split lorem ipsum into words for random message generation
	loremWords = strings.Fields(loremIpsum)

	// Load words for username generation
	wordsData, err := os.ReadFile("cmd/loadtest/words.txt")
	if err != nil {
		log.Fatalf("Failed to load words.txt: %v", err)
	}
	usernameWords = strings.Fields(string(wordsData))
	if len(usernameWords) == 0 {
		log.Fatal("words.txt is empty")
	}
}

// generateUsername creates a realistic-looking username by combining fragments of two random words
func generateUsername() string {
	// Pick two random words
	word1 := usernameWords[rand.Intn(len(usernameWords))]
	word2 := usernameWords[rand.Intn(len(usernameWords))]

	// Take a random fragment from each word (3-6 characters)
	// Word 1: from start
	len1 := len(word1)
	fragLen1 := 3
	if len1 > 6 {
		fragLen1 = 3 + rand.Intn(4) // 3-6 chars
	} else if len1 > 3 {
		fragLen1 = 3
	} else {
		fragLen1 = len1
	}
	if fragLen1 > len1 {
		fragLen1 = len1
	}

	// Word 2: from start
	len2 := len(word2)
	fragLen2 := 3
	if len2 > 6 {
		fragLen2 = 3 + rand.Intn(4) // 3-6 chars
	} else if len2 > 3 {
		fragLen2 = 3
	} else {
		fragLen2 = len2
	}
	if fragLen2 > len2 {
		fragLen2 = len2
	}

	frag1 := word1[:fragLen1]
	frag2 := word2[:fragLen2]

	// Combine and lowercase
	username := strings.ToLower(frag1 + frag2)

	// Ensure it's valid (3-20 chars, alphanumeric)
	if len(username) < 3 {
		username = username + "user"
	}
	if len(username) > 20 {
		username = username[:20]
	}

	return username
}

// Stats tracks performance metrics
type Stats struct {
	messagesPosted    atomic.Int64
	messagesFailed    atomic.Int64
	totalResponseTime atomic.Int64 // in microseconds
	connectionErrors  atomic.Int64

	// Detailed failure tracking
	postFailures     atomic.Int64
	fetchFailures    atomic.Int64
	timeouts         atomic.Int64
	disconnections   atomic.Int64
}

func (s *Stats) recordSuccess(responseTimeUs int64) {
	s.messagesPosted.Add(1)
	s.totalResponseTime.Add(responseTimeUs)
}

func (s *Stats) recordFailure() {
	s.messagesFailed.Add(1)
}

func (s *Stats) recordPostFailure() {
	s.messagesFailed.Add(1)
	s.postFailures.Add(1)
}

func (s *Stats) recordFetchFailure() {
	s.fetchFailures.Add(1)
}

func (s *Stats) recordTimeout() {
	s.messagesFailed.Add(1)
	s.timeouts.Add(1)
}

func (s *Stats) recordConnectionError() {
	s.connectionErrors.Add(1)
}

func (s *Stats) recordDisconnection() {
	s.messagesFailed.Add(1)
	s.disconnections.Add(1)
}

func (s *Stats) snapshot() (posted, failed, connErrors int64, avgResponseUs float64) {
	posted = s.messagesPosted.Load()
	failed = s.messagesFailed.Load()
	connErrors = s.connectionErrors.Load()

	if posted > 0 {
		avgResponseUs = float64(s.totalResponseTime.Load()) / float64(posted)
	}

	return
}

// BotClient represents a fake client for load testing
type BotClient struct {
	id         int
	nickname   string
	conn       *client.Connection
	stats      *Stats
	channelID  uint64
	messages   []uint64 // Cache of message IDs we've seen
	messagesMu sync.Mutex
}

func NewBotClient(id int, serverAddr string, stats *Stats) (*BotClient, error) {
	nickname := generateUsername()

	conn, err := client.NewConnection(serverAddr)
	if err != nil {
		return nil, fmt.Errorf("failed to create connection: %w", err)
	}

	return &BotClient{
		id:       id,
		nickname: nickname,
		conn:     conn,
		stats:    stats,
		messages: make([]uint64, 0, 100),
	}, nil
}

func (bc *BotClient) Connect() error {
	if err := bc.conn.Connect(); err != nil {
		bc.stats.recordConnectionError()
		return err
	}

	// Wait for server config
	select {
	case frame := <-bc.conn.Incoming():
		if frame.Type != protocol.TypeServerConfig {
			return fmt.Errorf("expected server config, got type 0x%02X", frame.Type)
		}
	case <-time.After(5 * time.Second):
		return fmt.Errorf("timeout waiting for server config")
	}

	// Set nickname
	msg := &protocol.SetNicknameMessage{Nickname: bc.nickname}
	if err := bc.conn.SendMessage(protocol.TypeSetNickname, msg); err != nil {
		return err
	}

	// Wait for nickname response
	select {
	case frame := <-bc.conn.Incoming():
		if frame.Type == protocol.TypeError {
			return fmt.Errorf("nickname rejected")
		}
	case <-time.After(5 * time.Second):
		return fmt.Errorf("timeout waiting for nickname response")
	}

	return nil
}

func (bc *BotClient) Setup() error {
	// List channels
	if err := bc.conn.SendMessage(protocol.TypeListChannels, &protocol.ListChannelsMessage{}); err != nil {
		return err
	}

	// Wait for channel list
	var channels []protocol.Channel
	select {
	case frame := <-bc.conn.Incoming():
		if frame.Type != protocol.TypeChannelList {
			return fmt.Errorf("expected channel list, got type 0x%02X", frame.Type)
		}

		resp := &protocol.ChannelListMessage{}
		if err := resp.Decode(frame.Payload); err != nil {
			return err
		}
		channels = resp.Channels
	case <-time.After(5 * time.Second):
		return fmt.Errorf("timeout waiting for channel list")
	}

	if len(channels) == 0 {
		return fmt.Errorf("no channels available")
	}

	// Pick random channel
	channel := channels[rand.Intn(len(channels))]
	bc.channelID = channel.ID

	// Join channel
	joinMsg := &protocol.JoinChannelMessage{ChannelID: channel.ID}
	if err := bc.conn.SendMessage(protocol.TypeJoinChannel, joinMsg); err != nil {
		return err
	}

	// Wait for join response
	select {
	case frame := <-bc.conn.Incoming():
		if frame.Type == protocol.TypeError {
			return fmt.Errorf("failed to join channel")
		}
	case <-time.After(5 * time.Second):
		return fmt.Errorf("timeout waiting for join response")
	}

	return nil
}

func (bc *BotClient) PostRandomMessage() error {
	// Decide: new thread (10%) or reply (90%)
	createNewThread := rand.Float32() < 0.1

	var parentID *uint64
	if !createNewThread && len(bc.messages) > 0 {
		// Pick random message to reply to
		bc.messagesMu.Lock()
		randomMsg := bc.messages[rand.Intn(len(bc.messages))]
		bc.messagesMu.Unlock()
		parentID = &randomMsg
	}

	// Generate random message content (5-20 words)
	wordCount := 5 + rand.Intn(16)
	var words []string
	for i := 0; i < wordCount; i++ {
		words = append(words, loremWords[rand.Intn(len(loremWords))])
	}
	content := strings.Join(words, " ")

	// Post message
	start := time.Now()
	postMsg := &protocol.PostMessageMessage{
		ChannelID: bc.channelID,
		ParentID:  parentID,
		Content:   content,
	}

	if err := bc.conn.SendMessage(protocol.TypePostMessage, postMsg); err != nil {
		// Check if it's a connection error (broken pipe, connection reset, etc)
		if strings.Contains(err.Error(), "broken pipe") ||
		   strings.Contains(err.Error(), "connection reset") ||
		   strings.Contains(err.Error(), "EOF") {
			bc.stats.recordDisconnection()
		} else {
			bc.stats.recordFailure()
		}
		return err
	}

	// Wait for response
	select {
	case frame := <-bc.conn.Incoming():
		// Check if channel was closed (connection died)
		if frame == nil {
			bc.stats.recordDisconnection()
			return fmt.Errorf("connection closed")
		}

		responseTime := time.Since(start).Microseconds()

		if frame.Type == protocol.TypeError {
			bc.stats.recordPostFailure()
			return fmt.Errorf("post message failed")
		}

		if frame.Type == protocol.TypeMessagePosted {
			resp := &protocol.MessagePostedMessage{}
			if err := resp.Decode(frame.Payload); err == nil {
				// Cache the message ID
				bc.messagesMu.Lock()
				bc.messages = append(bc.messages, resp.MessageID)
				bc.messagesMu.Unlock()
			}
		}

		bc.stats.recordSuccess(responseTime)
	case <-time.After(10 * time.Second):
		bc.stats.recordTimeout()
		return fmt.Errorf("timeout waiting for post response")
	}

	return nil
}

func (bc *BotClient) FetchMessages() error {
	// Periodically fetch messages to update our cache
	listMsg := &protocol.ListMessagesMessage{
		ChannelID: bc.channelID,
		ParentID:  nil,
		Limit:     50,
	}

	if err := bc.conn.SendMessage(protocol.TypeListMessages, listMsg); err != nil {
		return err
	}

	// Wait for response
	select {
	case frame := <-bc.conn.Incoming():
		if frame.Type == protocol.TypeMessageList {
			resp := &protocol.MessageListMessage{}
			if err := resp.Decode(frame.Payload); err == nil {
				bc.messagesMu.Lock()
				for _, msg := range resp.Messages {
					bc.messages = append(bc.messages, msg.ID)
				}
				bc.messagesMu.Unlock()
			}
		}
	case <-time.After(5 * time.Second):
		bc.stats.recordFetchFailure()
		return fmt.Errorf("timeout fetching messages")
	}

	return nil
}

func (bc *BotClient) Run(duration time.Duration, minDelay, maxDelay time.Duration, shutdownDelay time.Duration) {
	defer bc.conn.Close()
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[Bot %d] PANIC: %v", bc.id, r)
			// Try to send graceful disconnect even on panic
			bc.conn.SendMessage(protocol.TypeDisconnect, &protocol.DisconnectMessage{})
			time.Sleep(50 * time.Millisecond)
		}
	}()

	// Initial message fetch
	if err := bc.FetchMessages(); err != nil {
		// Silently ignore initial fetch failures
	}

	endTime := time.Now().Add(duration)
	iteration := 0

	for time.Now().Before(endTime) {
		iteration++

		// Post a message
		if err := bc.PostRandomMessage(); err != nil {
			// Only log critical errors
		}

		// Refresh message list every 3 iterations to discover new threads
		if iteration%3 == 0 {
			if err := bc.FetchMessages(); err != nil {
				// Silently ignore fetch failures
			}
		}

		// Random delay between posts
		delay := minDelay + time.Duration(rand.Int63n(int64(maxDelay-minDelay)))
		time.Sleep(delay)
	}

	// Stagger shutdown to avoid thundering herd on disconnect
	if shutdownDelay > 0 {
		time.Sleep(shutdownDelay)
	}

	// Send graceful disconnect message
	bc.conn.SendMessage(protocol.TypeDisconnect, &protocol.DisconnectMessage{})

	// Give server time to process disconnect before closing connection
	time.Sleep(100 * time.Millisecond)
}

func main() {
	// Command-line flags
	serverAddr := flag.String("server", "localhost:6465", "Server address (host:port)")
	numClients := flag.Int("clients", 10, "Number of concurrent clients")
	duration := flag.Duration("duration", 1*time.Minute, "Test duration")
	minDelay := flag.Duration("min-delay", 100*time.Millisecond, "Minimum delay between posts")
	maxDelay := flag.Duration("max-delay", 1*time.Second, "Maximum delay between posts")
	flag.Parse()

	// Calculate stagger delay: ramp up over 25% of test duration
	rampUpDuration := *duration / 4
	staggerDelay := rampUpDuration / time.Duration(*numClients)
	if staggerDelay < 1*time.Millisecond {
		staggerDelay = 1 * time.Millisecond
	}

	log.Printf("Starting load test:")
	log.Printf("  Server: %s", *serverAddr)
	log.Printf("  Clients: %d", *numClients)
	log.Printf("  Duration: %v", *duration)
	log.Printf("  Ramp-up: %v (%v per client)", rampUpDuration, staggerDelay)
	log.Printf("  Delay: %v - %v", *minDelay, *maxDelay)
	log.Printf("")

	stats := &Stats{}
	var wg sync.WaitGroup

	// Start stats reporter
	stopStats := make(chan struct{})
	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()

		startTime := time.Now()
		for {
			select {
			case <-ticker.C:
				posted, failed, connErrors, avgUs := stats.snapshot()
				elapsed := time.Since(startTime).Seconds()
				rate := float64(posted) / elapsed
				avgMs := avgUs / 1000.0

				log.Printf("Stats: %d posted (%.1f/s), %d failed, %d conn errors, avg %.2fms",
					posted, rate, failed, connErrors, avgMs)
			case <-stopStats:
				return
			}
		}
	}()

	// Spawn clients
	for i := 0; i < *numClients; i++ {
		wg.Add(1)

		// Calculate shutdown delay for this bot (reverse order for ramp-down)
		shutdownDelay := staggerDelay * time.Duration(*numClients-i-1)

		go func(id int, shutdownDelay time.Duration) {
			defer wg.Done()

			bot, err := NewBotClient(id, *serverAddr, stats)
			if err != nil {
				stats.recordConnectionError()
				return
			}

			if err := bot.Connect(); err != nil {
				stats.recordConnectionError()
				return
			}

			if err := bot.Setup(); err != nil {
				stats.recordConnectionError()
				return
			}

			// Only log every 100th client during ramp-up
			if id%100 == 0 {
				log.Printf("[Bot %d] Connected", id)
			}

			bot.Run(*duration, *minDelay, *maxDelay, shutdownDelay)
		}(i, shutdownDelay)

		// Stagger client connections based on calculated delay
		time.Sleep(staggerDelay)
	}

	// Handle graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigChan
		log.Printf("\nShutdown signal received, stopping test...")
		close(stopStats)
	}()

	// Wait for all clients to finish
	wg.Wait()
	close(stopStats)

	// Final stats
	posted, failed, connErrors, avgUs := stats.snapshot()
	totalDuration := *duration
	rate := float64(posted) / totalDuration.Seconds()
	avgMs := avgUs / 1000.0

	// Calculate expected throughput
	avgDelay := (*minDelay + *maxDelay) / 2
	expectedPerClient := float64(totalDuration) / float64(avgDelay)
	expectedTotal := expectedPerClient * float64(*numClients)
	efficiency := float64(posted) / expectedTotal * 100

	// Detailed failure breakdown
	postFails := stats.postFailures.Load()
	fetchFails := stats.fetchFailures.Load()
	timeouts := stats.timeouts.Load()
	disconnects := stats.disconnections.Load()

	log.Printf("\n=== Final Results ===")
	log.Printf("Duration: %v", totalDuration)
	log.Printf("Messages posted: %d (%.1f/s)", posted, rate)
	log.Printf("Messages failed: %d", failed)
	log.Printf("  - Post failures: %d", postFails)
	log.Printf("  - Fetch failures: %d", fetchFails)
	log.Printf("  - Timeouts: %d", timeouts)
	log.Printf("  - Disconnections: %d", disconnects)
	log.Printf("Connection errors: %d", connErrors)
	log.Printf("Average response time: %.2fms", avgMs)
	log.Printf("Expected throughput: %.0f messages (%.1f per client)", expectedTotal, expectedPerClient)
	log.Printf("Actual vs expected: %.1f%% efficiency", efficiency)

	if posted > 0 {
		successRate := float64(posted) / float64(posted+failed) * 100
		log.Printf("Success rate: %.1f%%", successRate)
	}
}
