"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sources_1 = require("../src/sources");
describe("source registry", () => {
    it("contains at least 20 sources", () => {
        expect(sources_1.sourceRegistry.length).toBeGreaterThanOrEqual(20);
    });
    it("every source has required fields", () => {
        for (const source of sources_1.sourceRegistry) {
            expect(source.name).toBeTruthy();
            expect(source.url).toBeTruthy();
            expect(source.type).toBeTruthy();
            expect(source.authorityType).toBeTruthy();
            expect(source.jurisdiction).toBeTruthy();
            expect(source.jurisdictionCountry).toBeTruthy();
            expect(source.reliabilityTier).toBeGreaterThanOrEqual(1);
            expect(source.reliabilityTier).toBeLessThanOrEqual(5);
            expect(source.description).toBeTruthy();
        }
    });
    it("includes US federal sources", () => {
        const usSources = sources_1.sourceRegistry.filter((s) => s.jurisdictionCountry === "United States");
        expect(usSources.length).toBeGreaterThanOrEqual(4);
    });
    it("includes EU sources", () => {
        const euSources = sources_1.sourceRegistry.filter((s) => s.jurisdictionCountry === "European Union");
        expect(euSources.length).toBeGreaterThanOrEqual(2);
    });
    it("includes UK sources", () => {
        const ukSources = sources_1.sourceRegistry.filter((s) => s.jurisdictionCountry === "United Kingdom");
        expect(ukSources.length).toBeGreaterThanOrEqual(2);
    });
    it("includes Australia sources", () => {
        const auSources = sources_1.sourceRegistry.filter((s) => s.jurisdictionCountry === "Australia");
        expect(auSources.length).toBeGreaterThanOrEqual(1);
    });
    it("includes APAC sources", () => {
        const apacCountries = ["Singapore", "South Korea", "Japan", "India"];
        const apacSources = sources_1.sourceRegistry.filter((s) => apacCountries.includes(s.jurisdictionCountry));
        expect(apacSources.length).toBeGreaterThanOrEqual(2);
    });
    it("has unique source names", () => {
        const names = sources_1.sourceRegistry.map((s) => s.name);
        const unique = new Set(names);
        expect(unique.size).toBe(names.length);
    });
    it("getSourcesByJurisdiction returns correct sources", () => {
        const ukSources = (0, sources_1.getSourcesByJurisdiction)("United Kingdom");
        expect(ukSources.length).toBeGreaterThanOrEqual(1);
        ukSources.forEach((s) => {
            expect(s.jurisdictionCountry === "United Kingdom" || s.jurisdiction === "United Kingdom").toBe(true);
        });
    });
    it("getSourcesByMinReliability filters correctly", () => {
        const officialOnly = (0, sources_1.getSourcesByMinReliability)(5);
        officialOnly.forEach((s) => expect(s.reliabilityTier).toBeGreaterThanOrEqual(5));
        const allSources = (0, sources_1.getSourcesByMinReliability)(1);
        expect(allSources.length).toBe(sources_1.sourceRegistry.length);
    });
    it("getRegisteredJurisdictions returns unique countries", () => {
        const jurisdictions = (0, sources_1.getRegisteredJurisdictions)();
        expect(jurisdictions.length).toBeGreaterThanOrEqual(5);
        expect(new Set(jurisdictions).size).toBe(jurisdictions.length);
    });
});
//# sourceMappingURL=sources.test.js.map