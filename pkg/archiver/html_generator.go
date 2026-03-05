package archiver

import (
	"embed"
	"fmt"
	"html/template"
	"log"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"
)

//go:embed templates/*.html
var templateFS embed.FS

const messagesPerPage = 50

// HTMLGenerator produces static HTML pages from archived messages.
type HTMLGenerator struct {
	outputDir  string
	store      *Store
	templates  *template.Template
	generating atomic.Bool
}

// NewHTMLGenerator creates a new HTML generator.
func NewHTMLGenerator(outputDir string, store *Store) *HTMLGenerator {
	funcMap := template.FuncMap{
		"formatTime": func(unixMs int64) string {
			return time.UnixMilli(unixMs).UTC().Format("2006-01-02 15:04:05 UTC")
		},
		"add": func(a, b int) int { return a + b },
		"sub": func(a, b int) int { return a - b },
		"depthStyle": func(depth int) template.CSS {
			if depth == 0 {
				return ""
			}
			return template.CSS(fmt.Sprintf("margin-left: %drem", depth*2))
		},
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

// GenerateAll regenerates all HTML pages for all servers.
// Skips if a generation is already in progress.
func (g *HTMLGenerator) GenerateAll() {
	if !g.generating.CompareAndSwap(false, true) {
		log.Printf("[archiver/html] skipping generation, previous run still in progress")
		return
	}
	defer g.generating.Store(false)

	servers, err := g.store.GetServers()
	if err != nil {
		log.Printf("[archiver/html] failed to get servers: %v", err)
		return
	}

	if err := g.generateIndex(servers); err != nil {
		log.Printf("[archiver/html] failed to generate index: %v", err)
	}

	for _, srv := range servers {
		g.generateServer(srv)
	}
}

// generateServer generates all HTML pages for a single server.
func (g *HTMLGenerator) generateServer(srv ServerRow) {
	channels, err := g.store.GetChannelsByServer(srv.ID)
	if err != nil {
		log.Printf("[archiver/html] failed to get channels for server %q: %v", srv.Name, err)
		return
	}

	serverDir := filepath.Join(g.outputDir, srv.Slug)
	if err := os.MkdirAll(serverDir, 0755); err != nil {
		log.Printf("[archiver/html] failed to create dir %s: %v", serverDir, err)
		return
	}

	// Generate server index (channel listing)
	data := serverPageData{
		Server:      srv,
		Channels:    channels,
		GeneratedAt: time.Now().UTC().Format("2006-01-02 15:04:05 UTC"),
	}
	if err := g.renderToFile(filepath.Join(serverDir, "index.html"), "server.html", data); err != nil {
		log.Printf("[archiver/html] failed to write server index for %q: %v", srv.Name, err)
	}

	for _, ch := range channels {
		g.generateChannel(srv, ch)
	}
}

// generateChannel regenerates HTML pages for a single channel.
func (g *HTMLGenerator) generateChannel(srv ServerRow, ch ChannelRow) {
	totalMessages, err := g.store.GetMessageCount(ch.ID)
	if err != nil {
		log.Printf("[archiver/html] failed to get message count for channel %d: %v", ch.ID, err)
		return
	}

	totalPages := (totalMessages + messagesPerPage - 1) / messagesPerPage
	if totalPages == 0 {
		totalPages = 1
	}

	channelDir := filepath.Join(g.outputDir, srv.Slug, "channel", ch.Name)
	if err := os.MkdirAll(channelDir, 0755); err != nil {
		log.Printf("[archiver/html] failed to create dir %s: %v", channelDir, err)
		return
	}

	// Generate paginated channel pages
	for page := 1; page <= totalPages; page++ {
		offset := (page - 1) * messagesPerPage
		messages, err := g.store.GetRootMessages(ch.ID, messagesPerPage, offset)
		if err != nil {
			log.Printf("[archiver/html] failed to get messages for channel %d page %d: %v", ch.ID, page, err)
			continue
		}

		data := channelPageData{
			Server:      srv,
			Channel:     ch,
			Messages:    messages,
			Page:        page,
			TotalPages:  totalPages,
			GeneratedAt: time.Now().UTC().Format("2006-01-02 15:04:05 UTC"),
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
	rootMessages, err := g.store.GetRootMessages(ch.ID, totalMessages, 0)
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

		data := threadPageData{
			Server:      srv,
			Channel:     ch,
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

// generateIndex generates the root index page listing all servers.
func (g *HTMLGenerator) generateIndex(servers []ServerRow) error {
	if err := os.MkdirAll(g.outputDir, 0755); err != nil {
		return err
	}

	data := indexPageData{
		Servers:     servers,
		GeneratedAt: time.Now().UTC().Format("2006-01-02 15:04:05 UTC"),
	}

	return g.renderToFile(filepath.Join(g.outputDir, "index.html"), "index.html", data)
}

// renderToFile renders a template to a file.
func (g *HTMLGenerator) renderToFile(path, tmplName string, data any) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	return g.templates.ExecuteTemplate(f, tmplName, data)
}

// Template data types

type indexPageData struct {
	Servers     []ServerRow
	GeneratedAt string
}

type serverPageData struct {
	Server      ServerRow
	Channels    []ChannelRow
	GeneratedAt string
}

type channelPageData struct {
	Server      ServerRow
	Channel     ChannelRow
	Messages    []MessageRow
	Page        int
	TotalPages  int
	GeneratedAt string
}

type threadPageData struct {
	Server      ServerRow
	Channel     ChannelRow
	RootMessage MessageRow
	Messages    []MessageRow
	GeneratedAt string
}
