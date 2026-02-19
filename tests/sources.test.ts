import { sourceRegistry, getSourcesByJurisdiction, getSourcesByMinReliability, getRegisteredJurisdictions } from "../src/sources";

describe("source registry", () => {
  it("contains at least 20 sources", () => {
    expect(sourceRegistry.length).toBeGreaterThanOrEqual(20);
  });

  it("every source has required fields", () => {
    for (const source of sourceRegistry) {
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
    const usSources = sourceRegistry.filter((s) => s.jurisdictionCountry === "United States");
    expect(usSources.length).toBeGreaterThanOrEqual(4);
  });

  it("includes EU sources", () => {
    const euSources = sourceRegistry.filter((s) => s.jurisdictionCountry === "European Union");
    expect(euSources.length).toBeGreaterThanOrEqual(2);
  });

  it("includes UK sources", () => {
    const ukSources = sourceRegistry.filter((s) => s.jurisdictionCountry === "United Kingdom");
    expect(ukSources.length).toBeGreaterThanOrEqual(2);
  });

  it("includes Australia sources", () => {
    const auSources = sourceRegistry.filter((s) => s.jurisdictionCountry === "Australia");
    expect(auSources.length).toBeGreaterThanOrEqual(1);
  });

  it("includes APAC sources", () => {
    const apacCountries = ["Singapore", "South Korea", "Japan", "India"];
    const apacSources = sourceRegistry.filter((s) => apacCountries.includes(s.jurisdictionCountry));
    expect(apacSources.length).toBeGreaterThanOrEqual(2);
  });

  it("has unique source names", () => {
    const names = sourceRegistry.map((s) => s.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("getSourcesByJurisdiction returns correct sources", () => {
    const ukSources = getSourcesByJurisdiction("United Kingdom");
    expect(ukSources.length).toBeGreaterThanOrEqual(1);
    ukSources.forEach((s) => {
      expect(s.jurisdictionCountry === "United Kingdom" || s.jurisdiction === "United Kingdom").toBe(true);
    });
  });

  it("getSourcesByMinReliability filters correctly", () => {
    const officialOnly = getSourcesByMinReliability(5);
    officialOnly.forEach((s) => expect(s.reliabilityTier).toBeGreaterThanOrEqual(5));

    const allSources = getSourcesByMinReliability(1);
    expect(allSources.length).toBe(sourceRegistry.length);
  });

  it("getRegisteredJurisdictions returns unique countries", () => {
    const jurisdictions = getRegisteredJurisdictions();
    expect(jurisdictions.length).toBeGreaterThanOrEqual(5);
    expect(new Set(jurisdictions).size).toBe(jurisdictions.length);
  });
});
