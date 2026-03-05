package archiver

import (
	"embed"
	"fmt"
	"html/template"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"
)

//go:embed templates/*.html
var templateFS embed.FS

const messagesPerPage = 50

// HTMLGenerator produces static HTML pages from archived messages.
type HTMLGenerator struct {
	outputDir string
	store     *Store
	templates *template.Template
}

// NewHTMLGenerator creates a new HTML generator.
func NewHTMLGenerator(outputDir string, store *Store) *HTMLGenerator {
	funcMap := template.FuncMap{
		"formatTime": func(unixMs int64) string {
			return time.UnixMilli(unixMs).UTC().Format("2006-01-02 15:04:05 UTC")
		},
		"add": func(a, b int) int { return a + b },
		"sub": func(a, b int) int { return a - b },
	}

	tmpl := template.Must(template.New("").Funcs(funcMap).ParseFS(templateFS, "templates/*.html"))

	return &HTMLGenerator{
		outputDir: outputDir,
		store:     store,
		templates: tmpl,
	}
}

// RunPeriodic regenerates all HTML pages on a timer.
func (g *HTMLGenerator) RunPeriodic(intervalSeconds int, shutdown <-chan struct{}, wg *sync.WaitGroup) {
	defer wg.Done()

	ticker := time.NewTicker(time.Duration(intervalSeconds) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-shutdown:
			return
		case <-ticker.C:
			g.GenerateAll()
		}
	}
}

// GenerateAll regenerates all HTML pages.
func (g *HTMLGenerator) GenerateAll() {
	channels, err := g.store.GetChannels()
	if err != nil {
		log.Printf("[archiver/html] failed to get channels: %v", err)
		return
	}

	if err := g.generateIndex(channels); err != nil {
		log.Printf("[archiver/html] failed to generate index: %v", err)
	}

	for _, ch := range channels {
		g.GenerateChannel(ch.ID)
	}
}

// GenerateChannel regenerates HTML pages for a single channel.
func (g *HTMLGenerator) GenerateChannel(channelID int64) {
	ch, err := g.store.GetChannelByID(channelID)
	if err != nil {
		log.Printf("[archiver/html] channel %d not found: %v", channelID, err)
		return
	}

	totalMessages, err := g.store.GetMessageCount(channelID)
	if err != nil {
		log.Printf("[archiver/html] failed to get message count for channel %d: %v", channelID, err)
		return
	}

	totalPages := (totalMessages + messagesPerPage - 1) / messagesPerPage
	if totalPages == 0 {
		totalPages = 1
	}

	channelDir := filepath.Join(g.outputDir, "channel", ch.Name)
	if err := os.MkdirAll(channelDir, 0755); err != nil {
		log.Printf("[archiver/html] failed to create dir %s: %v", channelDir, err)
		return
	}

	// Generate paginated channel pages
	for page := 1; page <= totalPages; page++ {
		offset := (page - 1) * messagesPerPage
		messages, err := g.store.GetRootMessages(channelID, messagesPerPage, offset)
		if err != nil {
			log.Printf("[archiver/html] failed to get messages for channel %d page %d: %v", channelID, page, err)
			continue
		}

		data := channelPageData{
			Channel:      *ch,
			Messages:     messages,
			Page:         page,
			TotalPages:   totalPages,
			GeneratedAt:  time.Now().UTC().Format("2006-01-02 15:04:05 UTC"),
		}

		filename := "index.html"
		if page > 1 {
			filename = fmt.Sprintf("page-%d.html", page)
		}

		if err := g.renderToFile(filepath.Join(channelDir, filename), "channel.html", data); err != nil {
			log.Printf("[archiver/html] failed to write %s: %v", filename, err)
		}
	}

	// Generate thread pages for root messages
	rootMessages, err := g.store.GetRootMessages(channelID, totalMessages, 0)
	if err != nil {
		log.Printf("[archiver/html] failed to get root messages for threads: %v", err)
		return
	}

	threadDir := filepath.Join(channelDir, "thread")
	if err := os.MkdirAll(threadDir, 0755); err != nil {
		log.Printf("[archiver/html] failed to create thread dir: %v", err)
		return
	}

	for _, rootMsg := range rootMessages {
		threadMessages, err := g.store.GetThreadMessages(rootMsg.ID)
		if err != nil {
			continue
		}
		if len(threadMessages) <= 1 {
			continue // No replies, skip
		}

		data := threadPageData{
			Channel:     *ch,
			RootMessage: rootMsg,
			Messages:    threadMessages,
			GeneratedAt: time.Now().UTC().Format("2006-01-02 15:04:05 UTC"),
		}

		filename := fmt.Sprintf("%d.html", rootMsg.ID)
		if err := g.renderToFile(filepath.Join(threadDir, filename), "thread.html", data); err != nil {
			log.Printf("[archiver/html] failed to write thread %d: %v", rootMsg.ID, err)
		}
	}
}

// generateIndex generates the main index page listing all channels.
func (g *HTMLGenerator) generateIndex(channels []ChannelRow) error {
	if err := os.MkdirAll(g.outputDir, 0755); err != nil {
		return err
	}

	data := indexPageData{
		Channels:    channels,
		GeneratedAt: time.Now().UTC().Format("2006-01-02 15:04:05 UTC"),
	}

	return g.renderToFile(filepath.Join(g.outputDir, "index.html"), "index.html", data)
}

// renderToFile renders a template to a file.
func (g *HTMLGenerator) renderToFile(path, tmplName string, data interface{}) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	return g.templates.ExecuteTemplate(f, tmplName, data)
}

// Template data types

type indexPageData struct {
	Channels    []ChannelRow
	GeneratedAt string
}

type channelPageData struct {
	Channel     ChannelRow
	Messages    []MessageRow
	Page        int
	TotalPages  int
	GeneratedAt string
}

type threadPageData struct {
	Channel     ChannelRow
	RootMessage MessageRow
	Messages    []MessageRow
	GeneratedAt string
}
