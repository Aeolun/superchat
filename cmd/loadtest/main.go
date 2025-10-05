package main

import (
	"flag"
	"fmt"
	"io"
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
	// Split by newlines and filter out empty lines
	lines := strings.Split(string(wordsData), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" {
			usernameWords = append(usernameWords, line)
		}
	}
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
	successfulClients atomic.Int64 // clients that successfully connected and started running

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
	id                 int
	nickname           string
	conn               *client.Connection
	stats              *Stats
	channelID          uint64
	messages           []uint64 // Cache of message IDs we've seen
	messagesMu         sync.Mutex
	currentThreadID    *uint64 // Currently subscribed thread (nil if not subscribed)
	currentThreadIDMu  sync.Mutex

	// Async message handling channels
	serverConfig    chan *protocol.Frame
	nicknameResp    chan *protocol.Frame
	channelList     chan *protocol.Frame
	joinResp        chan *protocol.Frame
	subscribeResp   chan *protocol.Frame
	postResp        chan *protocol.Frame
	messageList     chan *protocol.Frame
	errors          chan *protocol.Frame
	stopReader      chan struct{}
	readerStopped   chan struct{}
}

func NewBotClient(id int, serverAddr string, stats *Stats) (*BotClient, error) {
	nickname := generateUsername()

	conn, err := client.NewConnection(serverAddr)
	if err != nil {
		return nil, fmt.Errorf("failed to create connection: %w", err)
	}

	// Enable connection logging for debugging (writes to loadtest_debug.log only)
	// Create a prefixed logger for this bot
	botLogger := log.New(debugLogger.Writer(), fmt.Sprintf("[Bot %d] ", id), log.LstdFlags|log.Lmicroseconds)
	conn.SetLogger(botLogger)

	// Disable auto-reconnect for predictable load testing
	conn.DisableAutoReconnect()

	return &BotClient{
		id:            id,
		nickname:      nickname,
		conn:          conn,
		stats:         stats,
		messages:      make([]uint64, 0, 100),
		serverConfig:  make(chan *protocol.Frame, 1),
		nicknameResp:  make(chan *protocol.Frame, 1),
		channelList:   make(chan *protocol.Frame, 1),
		joinResp:      make(chan *protocol.Frame, 1),
		subscribeResp: make(chan *protocol.Frame, 1),
		postResp:      make(chan *protocol.Frame, 1),
		messageList:   make(chan *protocol.Frame, 1),
		errors:        make(chan *protocol.Frame, 10),
		stopReader:    make(chan struct{}),
		readerStopped: make(chan struct{}),
	}, nil
}

// startMessageReader starts a background goroutine that dispatches incoming messages
func (bc *BotClient) startMessageReader() {
	go func() {
		defer close(bc.readerStopped)

		for {
			select {
			case <-bc.stopReader:
				return
			case frame := <-bc.conn.Incoming():
				if frame == nil {
					// Connection closed
					return
				}

				// Dispatch to appropriate channel
				switch frame.Type {
				case protocol.TypeServerConfig:
					select {
					case bc.serverConfig <- frame:
					default:
						// Drop if channel full
					}
				case protocol.TypeNicknameResponse:
					select {
					case bc.nicknameResp <- frame:
					default:
					}
				case protocol.TypeChannelList:
					select {
					case bc.channelList <- frame:
					default:
					}
				case protocol.TypeJoinResponse:
					select {
					case bc.joinResp <- frame:
					default:
					}
				case protocol.TypeSubscribeOk:
					select {
					case bc.subscribeResp <- frame:
					default:
					}
				case protocol.TypeMessagePosted:
					select {
					case bc.postResp <- frame:
					default:
					}
				case protocol.TypeMessageList:
					select {
					case bc.messageList <- frame:
					default:
					}
				case protocol.TypeError:
					select {
					case bc.errors <- frame:
					default:
					}
				case protocol.TypeNewMessage:
					// Silently discard broadcasts
				default:
					// Ignore unknown message types
				}
			}
		}
	}()
}

func (bc *BotClient) Connect() error {
	if err := bc.conn.Connect(); err != nil {
		bc.stats.recordConnectionError()
		return err
	}

	// Start async message reader
	bc.startMessageReader()

	// Wait for server config
	select {
	case <-bc.serverConfig:
		// Got server config
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
	case frame := <-bc.nicknameResp:
		resp := &protocol.NicknameResponseMessage{}
		if err := resp.Decode(frame.Payload); err != nil {
			return fmt.Errorf("failed to decode nickname response: %w", err)
		}
		if !resp.Success {
			return fmt.Errorf("nickname rejected: %s", resp.Message)
		}
		return nil
	case frame := <-bc.errors:
		errMsg := &protocol.ErrorMessage{}
		errMsg.Decode(frame.Payload)
		return fmt.Errorf("nickname rejected: %s", errMsg.Message)
	case <-time.After(5 * time.Second):
		return fmt.Errorf("timeout waiting for nickname response")
	}
}

func (bc *BotClient) Setup() error {
	// List channels
	if err := bc.conn.SendMessage(protocol.TypeListChannels, &protocol.ListChannelsMessage{}); err != nil {
		return err
	}

	// Wait for channel list
	var channels []protocol.Channel
	select {
	case frame := <-bc.channelList:
		resp := &protocol.ChannelListMessage{}
		if err := resp.Decode(frame.Payload); err != nil {
			return err
		}
		channels = resp.Channels
	case <-bc.errors:
		return fmt.Errorf("failed to list channels")
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
	case <-bc.joinResp:
		// Joined successfully
	case <-bc.errors:
		return fmt.Errorf("failed to join channel")
	case <-time.After(5 * time.Second):
		return fmt.Errorf("timeout waiting for join response")
	}

	// Subscribe to channel for new thread notifications
	subscribeMsg := &protocol.SubscribeChannelMessage{
		ChannelID:    channel.ID,
		SubchannelID: nil,
	}
	if err := bc.conn.SendMessage(protocol.TypeSubscribeChannel, subscribeMsg); err != nil {
		return err
	}

	// Wait for subscribe confirmation (not critical if it fails)
	select {
	case <-bc.subscribeResp:
		// Subscribed successfully
	case <-bc.errors:
		// Subscription failed, but not critical - continue anyway
	case <-time.After(5 * time.Second):
		// Timeout on subscribe is not critical - continue anyway
	}

	return nil
}

func (bc *BotClient) PostRandomMessage() error {
	// Decide: new thread (10%) or reply (90%)
	createNewThread := rand.Float32() < 0.1

	var parentID *uint64
	if !createNewThread && len(bc.messages) > 0 {
		// Pick random message to reply to
		// NOTE: All cached messages are thread roots (from FetchMessages)
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
	case frame := <-bc.postResp:
		responseTime := time.Since(start).Microseconds()
		resp := &protocol.MessagePostedMessage{}
		if err := resp.Decode(frame.Payload); err == nil {
			// Cache the message ID
			bc.messagesMu.Lock()
			bc.messages = append(bc.messages, resp.MessageID)
			bc.messagesMu.Unlock()
		}
		bc.stats.recordSuccess(responseTime)
		return nil
	case frame := <-bc.errors:
		errMsg := &protocol.ErrorMessage{}
		if decodeErr := errMsg.Decode(frame.Payload); decodeErr == nil {
			log.Printf("[Bot %d] POST failed with error %d: %s", bc.id, errMsg.ErrorCode, errMsg.Message)
		}
		bc.stats.recordPostFailure()
		return fmt.Errorf("post message failed")
	case <-time.After(10 * time.Second):
		bc.stats.recordTimeout()
		return fmt.Errorf("timeout waiting for post response")
	}
}

func (bc *BotClient) FetchMessages() error {
	// Periodically fetch messages to update our cache
	listMsg := &protocol.ListMessagesMessage{
		ChannelID: bc.channelID,
		ParentID:  nil, // Fetch root messages only (thread starters)
		Limit:     50,
	}

	if err := bc.conn.SendMessage(protocol.TypeListMessages, listMsg); err != nil {
		return err
	}

	// Wait for response
	select {
	case frame := <-bc.messageList:
		resp := &protocol.MessageListMessage{}
		if err := resp.Decode(frame.Payload); err == nil {
			bc.messagesMu.Lock()
			// Update cache with root messages
			bc.messages = bc.messages[:0] // Clear old messages
			for _, msg := range resp.Messages {
				bc.messages = append(bc.messages, msg.ID)
			}

			// Pick a random thread to subscribe to
			var newThreadID *uint64
			if len(bc.messages) > 0 {
				randomThread := bc.messages[rand.Intn(len(bc.messages))]
				newThreadID = &randomThread
			}
			bc.messagesMu.Unlock()

			// Handle thread subscription switching
			bc.currentThreadIDMu.Lock()
			oldThreadID := bc.currentThreadID
			bc.currentThreadID = newThreadID
			bc.currentThreadIDMu.Unlock()

			// Unsubscribe from old thread
			if oldThreadID != nil {
				unsubMsg := &protocol.UnsubscribeThreadMessage{ThreadID: *oldThreadID}
				bc.conn.SendMessage(protocol.TypeUnsubscribeThread, unsubMsg)
			}

			// Subscribe to new thread
			if newThreadID != nil {
				subMsg := &protocol.SubscribeThreadMessage{ThreadID: *newThreadID}
				bc.conn.SendMessage(protocol.TypeSubscribeThread, subMsg)
			}
		}
		return nil
	case <-bc.errors:
		bc.stats.recordFetchFailure()
		return fmt.Errorf("failed to fetch messages")
	case <-time.After(5 * time.Second):
		bc.stats.recordFetchFailure()
		return fmt.Errorf("timeout fetching messages")
	}
}

func (bc *BotClient) Run(duration time.Duration, minDelay, maxDelay time.Duration, shutdownDelay time.Duration, disconnectTimes chan<- time.Time) {
	defer func() {
		// Stop message reader
		close(bc.stopReader)
		<-bc.readerStopped

		// Send graceful disconnect before closing
		bc.conn.SendMessage(protocol.TypeDisconnect, &protocol.DisconnectMessage{})
		time.Sleep(100 * time.Millisecond)
		bc.conn.Close()

		// Record disconnect time
		select {
		case disconnectTimes <- time.Now():
		default:
		}
	}()
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[Bot %d] PANIC: %v", bc.id, r)
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

var debugLogger *log.Logger

func initLogging() error {
	// Create loadtest.log file (truncate on each run to avoid confusion)
	logFile, err := os.OpenFile("loadtest.log", os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0666)
	if err != nil {
		return fmt.Errorf("failed to create loadtest.log: %w", err)
	}

	// Create loadtest_debug.log file for detailed bot communication logs
	debugLogFile, err := os.OpenFile("loadtest_debug.log", os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0666)
	if err != nil {
		return fmt.Errorf("failed to create loadtest_debug.log: %w", err)
	}

	// Configure standard log to write to both stdout and file
	log.SetOutput(io.MultiWriter(os.Stdout, logFile))
	log.SetFlags(log.LstdFlags)

	// Configure debug logger to write only to debug file
	debugLogger = log.New(debugLogFile, "", log.LstdFlags|log.Lmicroseconds)

	return nil
}

func main() {
	// Command-line flags
	serverAddr := flag.String("server", "localhost:6465", "Server address (host:port)")
	numClients := flag.Int("clients", 10, "Number of concurrent clients")
	duration := flag.Duration("duration", 1*time.Minute, "Test duration")
	minDelay := flag.Duration("min-delay", 100*time.Millisecond, "Minimum delay between posts")
	maxDelay := flag.Duration("max-delay", 1*time.Second, "Maximum delay between posts")
	flag.Parse()

	// Initialize logging to both stdout and file
	if err := initLogging(); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to initialize logging: %v\n", err)
		os.Exit(1)
	}
	log.Printf("Load test logs will be written to loadtest.log")
	log.Printf("Detailed bot communication logs in loadtest_debug.log")

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

	// Track ramp-up and ramp-down timing
	rampUpStart := time.Now()
	var firstConnectTime, lastConnectTime atomic.Value
	var firstDisconnectTime, lastDisconnectTime atomic.Value
	connectTimes := make(chan time.Time, *numClients)
	disconnectTimes := make(chan time.Time, *numClients)

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
				// Clean up connection if setup fails
				close(bot.stopReader)
				<-bot.readerStopped
				bot.conn.SendMessage(protocol.TypeDisconnect, &protocol.DisconnectMessage{})
				time.Sleep(100 * time.Millisecond)
				bot.conn.Close()
				return
			}

			// Record successful client connection
			stats.successfulClients.Add(1)

			// Record connection time
			connectTime := time.Now()
			select {
			case connectTimes <- connectTime:
			default:
			}

			// Only log every 100th client during ramp-up
			if id%100 == 0 {
				log.Printf("[Bot %d] Connected", id)
			}

			bot.Run(*duration, *minDelay, *maxDelay, shutdownDelay, disconnectTimes)
		}(i, shutdownDelay)

		// Stagger client connections based on calculated delay
		time.Sleep(staggerDelay)
	}

	// Track connection and disconnection times in background
	go func() {
		for t := range connectTimes {
			if firstConnectTime.Load() == nil {
				firstConnectTime.Store(t)
			}
			lastConnectTime.Store(t)
		}
	}()

	go func() {
		for t := range disconnectTimes {
			if firstDisconnectTime.Load() == nil {
				firstDisconnectTime.Store(t)
			}
			lastDisconnectTime.Store(t)
		}
	}()

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
	close(connectTimes)
	close(disconnectTimes)

	// Check ramp-up timing
	if lastConnectTime.Load() != nil && firstConnectTime.Load() != nil {
		first := firstConnectTime.Load().(time.Time)
		last := lastConnectTime.Load().(time.Time)
		actualRampUp := last.Sub(first)
		expectedRampUp := rampUpDuration

		tolerance := 1 * time.Second
		withinTolerance := actualRampUp >= expectedRampUp-tolerance && actualRampUp <= expectedRampUp+tolerance

		status := "✓"
		if !withinTolerance {
			status = "✗"
		}

		log.Printf("\n%s Ramp-up timing: expected %v, took %v (first: %v, last: %v)",
			status, expectedRampUp.Round(time.Second), actualRampUp.Round(time.Second),
			first.Sub(rampUpStart).Round(time.Millisecond), last.Sub(rampUpStart).Round(time.Millisecond))
	}

	// Check ramp-down timing
	if lastDisconnectTime.Load() != nil && firstDisconnectTime.Load() != nil {
		first := firstDisconnectTime.Load().(time.Time)
		last := lastDisconnectTime.Load().(time.Time)
		actualRampDown := last.Sub(first)
		expectedRampDown := rampUpDuration // Same as ramp-up

		tolerance := 1 * time.Second
		withinTolerance := actualRampDown >= expectedRampDown-tolerance && actualRampDown <= expectedRampDown+tolerance

		status := "✓"
		if !withinTolerance {
			status = "✗"
		}

		log.Printf("%s Ramp-down timing: expected %v, took %v (first: %v after start, last: %v after start)",
			status, expectedRampDown.Round(time.Second), actualRampDown.Round(time.Second),
			first.Sub(rampUpStart).Round(time.Second), last.Sub(rampUpStart).Round(time.Second))
	}

	// Total test duration (from first connect to last disconnect)
	if firstConnectTime.Load() != nil && lastDisconnectTime.Load() != nil {
		first := firstConnectTime.Load().(time.Time)
		last := lastDisconnectTime.Load().(time.Time)
		totalTestDuration := last.Sub(first)
		expectedTotal := *duration + rampUpDuration // ramp-up + test duration, ramp-down overlaps
		log.Printf("Total test duration: %v (expected: ~%v)\n",
			totalTestDuration.Round(time.Second),
			expectedTotal.Round(time.Second))
	}

	// Final stats
	posted, failed, connErrors, avgUs := stats.snapshot()
	successfulClients := stats.successfulClients.Load()
	totalDuration := *duration
	rate := float64(posted) / totalDuration.Seconds()
	avgMs := avgUs / 1000.0

	// Calculate expected throughput based on successful clients
	avgDelay := (*minDelay + *maxDelay) / 2
	expectedPerClient := float64(totalDuration) / float64(avgDelay)
	expectedTotal := expectedPerClient * float64(successfulClients)
	efficiency := 0.0
	if expectedTotal > 0 {
		efficiency = float64(posted) / expectedTotal * 100
	}

	// Detailed failure breakdown
	postFails := stats.postFailures.Load()
	fetchFails := stats.fetchFailures.Load()
	timeouts := stats.timeouts.Load()
	disconnects := stats.disconnections.Load()

	log.Printf("\n=== Final Results ===")
	log.Printf("Clients: %d attempted, %d successful (%.1f%%)", *numClients, successfulClients, float64(successfulClients)/float64(*numClients)*100)
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
