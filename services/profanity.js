/**
 * Profanity filter for Thai and English
 */

// Thai profanity words (common ones, can be extended)
const thaiProfanity = [
    'ควย', 'หี', 'เหี้ย', 'สัตว์', 'หน้าหี', 'อีดอก', 'อีสัตว์', 'ไอ้สัตว์',
    'อีควาย', 'ไอ้ควาย', 'กระหรี่', 'อีกระหรี่', 'แม่ง', 'เย็ด', 'ชิบหาย',
    'สันดาน', 'ระยำ', 'อีห่า', 'ไอ้ห่า', 'มึง', 'กู', 'อีหน้าหมา', 'หน้าหมา'
];

// English profanity words (common ones)
const englishProfanity = [
    'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'damn', 'dick', 'pussy',
    'cock', 'cunt', 'whore', 'slut', 'nigger', 'faggot', 'retard'
];

// L33t speak replacements
const leetReplacements = {
    '0': 'o',
    '1': 'i',
    '3': 'e',
    '4': 'a',
    '5': 's',
    '7': 't',
    '@': 'a',
    '$': 's'
};

/**
 * Normalize text for checking (remove special chars, l33t speak)
 */
function normalizeText(text) {
    if (!text) return '';

    let normalized = text.toLowerCase();

    // Replace l33t speak
    for (const [leet, char] of Object.entries(leetReplacements)) {
        normalized = normalized.replace(new RegExp(leet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), char);
    }

    // Remove special characters and spaces
    normalized = normalized.replace(/[^a-zA-Z0-9ก-๙]/g, '');

    return normalized;
}

/**
 * Check if text contains profanity
 */
function checkProfanity(text) {
    if (!text) return false;

    const normalized = normalizeText(text);
    const original = text.toLowerCase();

    // Check Thai profanity
    for (const word of thaiProfanity) {
        if (normalized.includes(word) || original.includes(word)) {
            return true;
        }
    }

    // Check English profanity
    for (const word of englishProfanity) {
        if (normalized.includes(word) || original.includes(word)) {
            return true;
        }
    }

    return false;
}

/**
 * Get list of profanity words found
 */
function findProfanity(text) {
    if (!text) return [];

    const found = [];
    const normalized = normalizeText(text);
    const original = text.toLowerCase();

    for (const word of [...thaiProfanity, ...englishProfanity]) {
        if (normalized.includes(word) || original.includes(word)) {
            found.push(word);
        }
    }

    return found;
}

module.exports = {
    checkProfanity,
    findProfanity,
    normalizeText
};
