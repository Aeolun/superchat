import { Component, onMount } from 'solid-js'
import { store, storeActions, ViewState, FocusArea } from '../store/app-store'
import Icon from '../components/Icon'

const HomePage: Component = () => {
  onMount(() => {
    store.setCurrentView(ViewState.ChannelList)
    store.setActiveChannelId(null)
    store.setActiveThreadId(null)
    store.setFocusArea(FocusArea.Sidebar)
    storeActions.clearMessages()
  })

  return (
    <div class="flex-1 flex flex-col overflow-hidden">
      {/* Mobile header bar when no channel selected */}
      <div class="border-b border-base-300 p-4 flex items-center justify-between flex-shrink-0 md:hidden">
        <button
          onClick={() => storeActions.toggleMobileSidebar()}
          class="btn btn-ghost btn-sm btn-circle"
          title="Channels"
        >
          <Icon name="list" size={20} />
        </button>
        <span class="font-bold text-lg">SuperChat</span>
        <button
          onClick={() => storeActions.toggleMobileUsers()}
          class="btn btn-ghost btn-sm btn-circle"
          title="Online users"
        >
          <Icon name="users" size={20} />
        </button>
      </div>
      <div class="flex-1 flex items-center justify-center p-8">
        <div class="text-center text-base-content/50">
          <h3 class="text-xl font-semibold mb-2">Select a channel to start chatting</h3>
          <p class="hidden md:block">Choose a channel from the sidebar</p>
          <p class="md:hidden">Tap the menu to see channels</p>
        </div>
      </div>
    </div>
  )
}

export default HomePage
