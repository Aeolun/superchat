package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/aeolun/superchat/pkg/archiver"
)

var Version = "dev"

func main() {
	log.SetFlags(log.Ldate | log.Ltime | log.Lmicroseconds)

	listen := flag.String("listen", ":6470", "Address to listen on for archive connections")
	dbPath := flag.String("db", "archive.db", "Path to archive SQLite database")
	outputDir := flag.String("output", "./archive-html", "Output directory for static HTML")
	htmlInterval := flag.Int("html-interval", 300, "HTML regeneration interval in seconds (0 = only after backfill)")
	version := flag.Bool("version", false, "Show version")
	flag.Parse()

	if *version {
		fmt.Printf("SuperChat Archiver %s\n", Version)
		os.Exit(0)
	}

	cfg := archiver.Config{
		ListenAddr:          *listen,
		DBPath:              *dbPath,
		OutputDir:           *outputDir,
		HTMLIntervalSeconds: *htmlInterval,
	}

	srv, err := archiver.New(cfg)
	if err != nil {
		log.Fatalf("Failed to create archiver: %v", err)
	}

	// Graceful shutdown on signal
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigCh
		log.Println("Shutting down archiver...")
		srv.Stop()
	}()

	log.Printf("SuperChat Archiver %s starting on %s", Version, *listen)
	if err := srv.Start(); err != nil {
		log.Fatalf("Archiver error: %v", err)
	}
}
