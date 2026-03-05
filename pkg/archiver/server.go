package archiver

import (
	"log"
	"net"
	"sync"
)

// Config holds archiver configuration.
type Config struct {
	ListenAddr          string
	DBPath              string
	OutputDir           string
	HTMLIntervalSeconds int
}

// Server is the archive service that receives messages from superchat servers
// and stores them permanently in SQLite + generates static HTML.
type Server struct {
	config   Config
	listener net.Listener
	store    *Store
	htmlGen  *HTMLGenerator
	shutdown chan struct{}
	wg       sync.WaitGroup
}

// New creates a new archiver server.
func New(cfg Config) (*Server, error) {
	store, err := NewStore(cfg.DBPath)
	if err != nil {
		return nil, err
	}

	htmlGen := NewHTMLGenerator(cfg.OutputDir, store)

	return &Server{
		config:   cfg,
		store:    store,
		htmlGen:  htmlGen,
		shutdown: make(chan struct{}),
	}, nil
}

// Start begins listening for archive connections. Blocks until Stop is called.
func (s *Server) Start() error {
	ln, err := net.Listen("tcp", s.config.ListenAddr)
	if err != nil {
		return err
	}
	s.listener = ln

	// Generate initial HTML so nginx has something to serve immediately
	s.htmlGen.GenerateAll()

	// Start periodic HTML generation if configured
	if s.config.HTMLIntervalSeconds > 0 {
		s.wg.Add(1)
		go s.htmlGen.RunPeriodic(s.config.HTMLIntervalSeconds, s.shutdown, &s.wg)
	}

	log.Printf("[archiver] listening on %s", s.config.ListenAddr)

	for {
		conn, err := ln.Accept()
		if err != nil {
			select {
			case <-s.shutdown:
				return nil
			default:
				log.Printf("[archiver] accept error: %v", err)
				continue
			}
		}

		s.wg.Add(1)
		go func() {
			defer s.wg.Done()
			h := NewHandler(conn, s.store, s.htmlGen)
			h.Serve(s.shutdown)
		}()
	}
}

// Stop gracefully shuts down the archiver.
func (s *Server) Stop() {
	close(s.shutdown)
	if s.listener != nil {
		s.listener.Close()
	}
	s.wg.Wait()
	s.store.Close()
}
