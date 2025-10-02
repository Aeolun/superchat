// GitHub repository info - update this with your actual repo
const GITHUB_REPO = 'aeolun/superchat';

// Platform configurations
const PLATFORMS = [
    { name: 'Linux', arch: 'x86_64', clientPattern: /^superchat-linux-amd64/, serverPattern: /^superchat-server-linux-amd64/ },
    { name: 'Linux', arch: 'ARM64', clientPattern: /^superchat-linux-arm64/, serverPattern: /^superchat-server-linux-arm64/ },
    { name: 'macOS', arch: 'Intel', clientPattern: /^superchat-darwin-amd64/, serverPattern: /^superchat-server-darwin-amd64/ },
    { name: 'macOS', arch: 'Apple Silicon', clientPattern: /^superchat-darwin-arm64/, serverPattern: /^superchat-server-darwin-arm64/ },
    { name: 'Windows', arch: 'x86_64', clientPattern: /^superchat-windows-amd64/, serverPattern: /^superchat-server-windows-amd64/ },
    { name: 'FreeBSD', arch: 'x86_64', clientPattern: /^superchat-freebsd-amd64/, serverPattern: /^superchat-server-freebsd-amd64/ }
];

async function fetchLatestRelease() {
    try {
        const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Failed to fetch releases:', error);
        return null;
    }
}

function createDownloadCard(platform, clientAsset, serverAsset) {
    const card = document.createElement('div');
    card.className = 'download-card';

    const platformName = document.createElement('div');
    platformName.className = 'platform';
    platformName.textContent = platform.name;

    const archName = document.createElement('div');
    archName.className = 'arch';
    archName.textContent = platform.arch;

    const buttons = document.createElement('div');
    buttons.className = 'download-buttons';

    if (clientAsset) {
        const clientBtn = document.createElement('a');
        clientBtn.className = 'download-btn client';
        clientBtn.href = clientAsset.browser_download_url;
        clientBtn.textContent = 'Client';
        buttons.appendChild(clientBtn);
    }

    if (serverAsset) {
        const serverBtn = document.createElement('a');
        serverBtn.className = 'download-btn server';
        serverBtn.href = serverAsset.browser_download_url;
        serverBtn.textContent = 'Server';
        buttons.appendChild(serverBtn);
    }

    card.appendChild(platformName);
    card.appendChild(archName);
    card.appendChild(buttons);

    return card;
}

async function populateDownloads() {
    const container = document.getElementById('download-links');

    const release = await fetchLatestRelease();

    if (!release || !release.assets || release.assets.length === 0) {
        container.innerHTML = `
            <p>No releases available yet. Check <a href="https://github.com/${GITHUB_REPO}/releases">GitHub Releases</a> for updates.</p>
        `;
        return;
    }

    const cards = [];

    for (const platform of PLATFORMS) {
        const clientAsset = release.assets.find(a => platform.clientPattern.test(a.name));
        const serverAsset = release.assets.find(a => platform.serverPattern.test(a.name));

        if (clientAsset || serverAsset) {
            cards.push(createDownloadCard(platform, clientAsset, serverAsset));
        }
    }

    if (cards.length === 0) {
        container.innerHTML = `
            <p>No binary downloads found. Visit <a href="https://github.com/${GITHUB_REPO}/releases/latest">GitHub Releases</a> to download.</p>
        `;
    } else {
        container.innerHTML = '';
        cards.forEach(card => container.appendChild(card));
    }
}

// Initialize
populateDownloads();
