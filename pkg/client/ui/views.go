package ui

// MainView represents the primary application view
type MainView int

const (
	MainViewSplash MainView = iota
	MainViewChannelList
	MainViewThreadList
	MainViewThreadDetail
)

// String returns the string representation of the main view
func (v MainView) String() string {
	switch v {
	case MainViewSplash:
		return "Splash"
	case MainViewChannelList:
		return "ChannelList"
	case MainViewThreadList:
		return "ThreadList"
	case MainViewThreadDetail:
		return "ThreadDetail"
	default:
		return "Unknown"
	}
}
