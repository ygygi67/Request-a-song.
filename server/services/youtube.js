const fetch = require('node-fetch');

/**
 * Validate music URL (YouTube or Spotify)
 */
function validateMusicLink(url) {
    if (!url) return { valid: false, platform: null };

    const youtubePatterns = [
        /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
        /^(https?:\/\/)?(www\.)?(youtu\.be\/)([a-zA-Z0-9_-]{11})/,
        /^(https?:\/\/)?(www\.)?(youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
        /^(https?:\/\/)?(music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/
    ];

    const spotifyPatterns = [
        /^(https?:\/\/)?(open\.)?spotify\.com\/track\/([a-zA-Z0-9]+)/,
        /^(https?:\/\/)?(open\.)?spotify\.com\/intl-[a-z]+\/track\/([a-zA-Z0-9]+)/
    ];

    if (youtubePatterns.some(p => p.test(url))) return { valid: true, platform: 'youtube' };
    if (spotifyPatterns.some(p => p.test(url))) return { valid: true, platform: 'spotify' };

    return { valid: false, platform: null };
}

function validateYouTubeLink(url) {
    return validateMusicLink(url).valid;
}

function extractYouTubeId(url) {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
}

async function getVideoInfo(url) {
    const linkInfo = validateMusicLink(url);
    if (!linkInfo.valid) return null;

    try {
        if (linkInfo.platform === 'youtube') {
            const videoId = extractYouTubeId(url);
            // Fetch oEmbed for basic info
            const oEmbedResponse = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
            let title = '';
            let author = '';

            if (oEmbedResponse.ok) {
                const oEmbedData = await oEmbedResponse.json();
                title = oEmbedData.title;
                author = oEmbedData.author_name;
            }

            // Fetch video page to get duration
            const pageResponse = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
            const pageText = await pageResponse.text();

            // Regex for duration ISO format (e.g., PT5M4S)
            const durationMatch = pageText.match(/"approxDurationMs":"(\d+)"/);
            let duration = 180; // default
            if (durationMatch) {
                duration = Math.floor(parseInt(durationMatch[1]) / 1000);
            }

            return {
                videoId,
                title: title || 'คิวเพลง YouTube',
                author: author || 'YouTube',
                thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
                thumbnailMedium: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
                platform: 'youtube',
                duration,
                url
            };
        } else if (linkInfo.platform === 'spotify') {
            const response = await fetch(`https://open.spotify.com/oembed?url=${url}`);
            if (!response.ok) return null;
            const data = await response.json();
            return {
                title: data.title,
                author: data.title.split(' - ')[0] || 'Spotify Artist',
                thumbnail: data.thumbnail_url,
                platform: 'spotify',
                duration: 180, // Spotify oEmbed doesn't provide duration easily
                url
            };
        }
    } catch (e) {
        console.error('Error in getVideoInfo:', e);
        return null;
    }
    return null;
}

/**
 * Real YouTube Search that returns video data
 */
async function searchYouTube(query) {
    try {
        const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%253D%253D`;
        const response = await fetch(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const html = await response.text();

        const dataMatch = html.match(/ytInitialData\s*=\s*({.+?});/);
        if (dataMatch) {
            const data = JSON.parse(dataMatch[1]);
            const contents = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents[0]?.itemSectionRenderer?.contents;

            if (contents) {
                const videos = contents
                    .filter(c => c.videoRenderer)
                    .map(c => {
                        const v = c.videoRenderer;
                        const videoId = v.videoId;
                        return {
                            videoId,
                            title: v.title.runs[0].text,
                            author: v.ownerText.runs[0].text,
                            thumbnail: v.thumbnail.thumbnails[0].url,
                            url: `https://www.youtube.com/watch?v=${videoId}`,
                            isSuggestion: false
                        };
                    });

                if (videos.length > 0) return videos;
            }
        }

        const suggestUrl = `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(query)}`;
        const suggestRes = await fetch(suggestUrl);
        const suggestText = await suggestRes.text();
        const startIdx = suggestText.indexOf('([');
        const endIdx = suggestText.lastIndexOf('])');
        if (startIdx === -1 || endIdx === -1) return [];
        const jsonStr = suggestText.substring(startIdx + 1, endIdx + 1);
        const suggestData = JSON.parse(jsonStr);
        return (suggestData[1] || []).map(s => ({
            title: s[0],
            author: 'YouTube',
            thumbnail: null,
            url: s[0],
            isSuggestion: true
        }));
    } catch (error) {
        console.error('Search error:', error);
        return [];
    }
}

/**
 * Resolve a query or vague link to a real YouTube video info
 */
async function resolveToVideo(input) {
    const linkInfo = validateMusicLink(input);
    if (linkInfo.valid) {
        return await getVideoInfo(input);
    }

    const results = await searchYouTube(input);
    const firstVideo = results.find(r => !r.isSuggestion);
    if (firstVideo) {
        return await getVideoInfo(firstVideo.url);
    }
    return null;
}

module.exports = {
    validateYouTubeLink,
    validateMusicLink,
    extractYouTubeId,
    getVideoInfo,
    searchYouTube,
    resolveToVideo
};
