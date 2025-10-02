// GitHub repository info - update this with your actual repo
const GITHUB_REPO = 'aeolun/superchat';

// Platform configurations
const PLATFORMS = [
    { name: 'Linux', arch: 'x86_64', pattern: /linux.*amd64/ },
    { name: 'Linux', arch: 'ARM64', pattern: /linux.*arm64/ },
    { name: 'macOS', arch: 'Intel', pattern: /darwin.*amd64/ },
    { name: 'macOS', arch: 'Apple Silicon', pattern: /darwin.*arm64/ },
    { name: 'Windows', arch: 'x86_64', pattern: /windows.*amd64/ },
    { name: 'FreeBSD', arch: 'x86_64', pattern: /freebsd.*amd64/ }
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

function createDownloadLink(asset, platform) {
    const link = document.createElement('a');
    link.className = 'download-link';
    link.href = asset.browser_download_url;
    link.innerHTML = `
        <div class="platform">${platform.name}</div>
        <div class="arch">${platform.arch}</div>
    `;
    return link;
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

    const links = [];

    for (const platform of PLATFORMS) {
        const asset = release.assets.find(a => platform.pattern.test(a.name.toLowerCase()));
        if (asset) {
            links.push(createDownloadLink(asset, platform));
        }
    }

    if (links.length === 0) {
        container.innerHTML = `
            <p>No binary downloads found. Visit <a href="https://github.com/${GITHUB_REPO}/releases/latest">GitHub Releases</a> to download.</p>
        `;
    } else {
        container.innerHTML = '';
        links.forEach(link => container.appendChild(link));
    }
}

// Initialize
populateDownloads();
