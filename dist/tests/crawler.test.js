"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crawler_1 = require("../src/crawler");
// Mock fetch globally
const originalFetch = global.fetch;
function mockFetch(response) {
    global.fetch = jest.fn().mockResolvedValue(response);
}
afterEach(() => {
    global.fetch = originalFetch;
});
const testSource = {
    name: "Test Source",
    url: "https://example.com/test",
    type: "government_page",
    authorityType: "national",
    jurisdiction: "Test Country",
    jurisdictionCountry: "Test Country",
    reliabilityTier: 5,
    description: "Test source for unit tests",
};
describe("crawlSource", () => {
    it("crawls a government page and extracts title + text", async () => {
        mockFetch({
            ok: true,
            text: () => Promise.resolve("<html><head><title>Test Page Title</title></head><body><p>Hello world regulation content</p></body></html>"),
        });
        const items = await (0, crawler_1.crawlSource)(testSource);
        expect(items).toHaveLength(1);
        expect(items[0].title).toBe("Test Page Title");
        expect(items[0].text).toContain("Hello world regulation content");
        expect(items[0].url).toBe("https://example.com/test");
        expect(items[0].source).toBe(testSource);
        expect(items[0].fetchedAt).toBeTruthy();
    });
    it("strips HTML tags from extracted text", async () => {
        mockFetch({
            ok: true,
            text: () => Promise.resolve("<html><body><script>var x = 1;</script><p><strong>Bold</strong> text</p></body></html>"),
        });
        const items = await (0, crawler_1.crawlSource)(testSource);
        expect(items[0].text).not.toContain("<script>");
        expect(items[0].text).not.toContain("<strong>");
        expect(items[0].text).toContain("Bold text");
    });
    it("returns empty array on HTTP error", async () => {
        mockFetch({
            ok: false,
            status: 404,
            text: () => Promise.resolve("Not Found"),
        });
        const items = await (0, crawler_1.crawlSource)(testSource);
        expect(items).toHaveLength(0);
    });
    it("returns empty array on fetch exception", async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error("Network error"));
        const items = await (0, crawler_1.crawlSource)(testSource);
        expect(items).toHaveLength(0);
    });
    it("parses RSS feed items", async () => {
        const rssSource = {
            ...testSource,
            name: "Test RSS Feed",
            type: "rss_feed",
        };
        mockFetch({
            ok: true,
            text: () => Promise.resolve(`<?xml version="1.0"?>
        <rss version="2.0">
          <channel>
            <item>
              <title>RSS Item 1</title>
              <link>https://example.com/item1</link>
              <description>First RSS item about regulation</description>
            </item>
            <item>
              <title>RSS Item 2</title>
              <link>https://example.com/item2</link>
              <description>Second RSS item about regulation</description>
            </item>
          </channel>
        </rss>`),
        });
        const items = await (0, crawler_1.crawlSource)(rssSource);
        expect(items).toHaveLength(2);
        expect(items[0].title).toBe("RSS Item 1");
        expect(items[0].url).toBe("https://example.com/item1");
        expect(items[1].title).toBe("RSS Item 2");
    });
    it("truncates text to max length", async () => {
        const longContent = "x".repeat(20000);
        mockFetch({
            ok: true,
            text: () => Promise.resolve(`<html><body>${longContent}</body></html>`),
        });
        const items = await (0, crawler_1.crawlSource)(testSource);
        expect(items[0].text.length).toBeLessThanOrEqual(10000);
    });
});
describe("crawlAllSources", () => {
    it("crawls multiple sources with concurrency", async () => {
        const sources = [
            { ...testSource, name: "Source 1" },
            { ...testSource, name: "Source 2" },
            { ...testSource, name: "Source 3" },
        ];
        mockFetch({
            ok: true,
            text: () => Promise.resolve("<html><head><title>Page</title></head><body>content</body></html>"),
        });
        const items = await (0, crawler_1.crawlAllSources)(sources, 2);
        expect(items).toHaveLength(3);
    });
    it("reports progress", async () => {
        const sources = [
            { ...testSource, name: "Source A" },
            { ...testSource, name: "Source B" },
        ];
        mockFetch({
            ok: true,
            text: () => Promise.resolve("<html><body>content</body></html>"),
        });
        const progress = [];
        await (0, crawler_1.crawlAllSources)(sources, 5, (completed, total, name) => {
            progress.push(`${completed}/${total}: ${name}`);
        });
        expect(progress).toHaveLength(2);
        expect(progress[0]).toContain("Source A");
        expect(progress[1]).toContain("Source B");
    });
    it("continues on individual source failures", async () => {
        const sources = [
            { ...testSource, name: "Good Source" },
            { ...testSource, name: "Bad Source", url: "https://example.com/fail" },
        ];
        let callCount = 0;
        global.fetch = jest.fn(async (url) => {
            callCount++;
            const urlStr = url instanceof URL ? url.toString() : typeof url === 'string' ? url : url.url;
            if (urlStr.includes("fail")) {
                throw new Error("Network failure");
            }
            return {
                ok: true,
                text: () => Promise.resolve("<html><body>good content</body></html>"),
            };
        });
        const items = await (0, crawler_1.crawlAllSources)(sources, 5);
        expect(items.length).toBeGreaterThanOrEqual(1);
    });
});
//# sourceMappingURL=crawler.test.js.map