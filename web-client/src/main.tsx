/* @refresh reload */
import { render } from 'solid-js/web'
import { HashRouter, Route } from '@solidjs/router'
import './style.css'
import App from './App'
import HomePage from './pages/HomePage'
import ChannelLayout from './pages/ChannelLayout'
import ChannelContent from './pages/ChannelContent'
import ThreadDetailPage from './pages/ThreadDetailPage'

render(
  () => (
    <HashRouter root={App}>
      <Route path="/" component={HomePage} />
      <Route path="/channel/:channelId" component={ChannelLayout}>
        <Route path="/" component={ChannelContent} />
        <Route path="/thread/:threadId" component={ThreadDetailPage} />
      </Route>
      <Route path="/channel/:channelId/sub/:subchannelId" component={ChannelLayout}>
        <Route path="/" component={ChannelContent} />
        <Route path="/thread/:threadId" component={ThreadDetailPage} />
      </Route>
    </HashRouter>
  ),
  document.getElementById('app')!
)
