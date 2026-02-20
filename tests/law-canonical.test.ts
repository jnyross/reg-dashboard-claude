import { inferCanonicalLaw } from "../src/law-canonical";

describe("inferCanonicalLaw", () => {
  it("extracts stable law key for acronym-based laws", () => {
    const first = inferCanonicalLaw({
      title: "FTC publishes COPPA Rule amendments for children",
      summary: "Updates to COPPA compliance expectations",
      content: null,
      jurisdictionCountry: "United States",
      jurisdictionState: null,
    });

    const second = inferCanonicalLaw({
      title: "COPPA enforcement update announced by FTC",
      summary: "Additional COPPA guidance for platforms",
      content: null,
      jurisdictionCountry: "United States",
      jurisdictionState: null,
    });

    expect(first.lawIdentifier).toBe("COPPA");
    expect(second.lawIdentifier).toBe("COPPA");
    expect(first.lawKey).toBe(second.lawKey);
  });

  it("includes jurisdiction in the canonical law key", () => {
    const us = inferCanonicalLaw({
      title: "Age-Appropriate Design Code Act enforcement",
      summary: null,
      content: null,
      jurisdictionCountry: "United States",
      jurisdictionState: "California",
    });

    const uk = inferCanonicalLaw({
      title: "Age-Appropriate Design Code Act enforcement",
      summary: null,
      content: null,
      jurisdictionCountry: "United Kingdom",
      jurisdictionState: null,
    });

    expect(us.lawKey).not.toBe(uk.lawKey);
  });
});
