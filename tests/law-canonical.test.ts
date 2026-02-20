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

    expect(first.lawName).toBe("Children's Online Privacy Protection Act (COPPA)");
    expect(first.lawIdentifier).toBe("COPPA");
    expect(second.lawIdentifier).toBe("COPPA");
    expect(first.lawKey).toBe(second.lawKey);
  });

  it("normalizes Online Safety Act aliases by jurisdiction", () => {
    const uk = inferCanonicalLaw({
      title: "Ofcom issues child protection codes under the UK Online Safety Act",
      summary: null,
      content: null,
      jurisdictionCountry: "United Kingdom",
      jurisdictionState: null,
    });

    const au = inferCanonicalLaw({
      title: "Australia has enacted the Online Safety Act and new child protections",
      summary: null,
      content: null,
      jurisdictionCountry: "Australia",
      jurisdictionState: null,
    });

    expect(uk.lawIdentifier).toBe("UK-OSA-2023");
    expect(uk.lawName).toBe("Online Safety Act 2023 (UK)");
    expect(au.lawIdentifier).toBe("AU-OSA-2021");
    expect(au.lawName).toBe("Online Safety Act 2021 (Australia)");
    expect(uk.lawKey).not.toBe(au.lawKey);
  });

  it("strips narrative fallback phrasing and does not append Framework", () => {
    const law = inferCanonicalLaw({
      title: "Potentially setting global standards for teen online safety",
      summary: "Commentary on policy direction",
      content: null,
      jurisdictionCountry: "Global",
      jurisdictionState: null,
    });

    expect(law.lawName).toBe("Child Online Safety Law");
    expect(law.lawName).not.toMatch(/framework/i);
  });

  it("avoids mapping unrelated DSA references without legal context", () => {
    const law = inferCanonicalLaw({
      title: "Parents say the DSA party changed school policy",
      summary: "Local school board dispute with no EU legal references",
      content: null,
      jurisdictionCountry: "Global",
      jurisdictionState: null,
    });

    expect(law.lawIdentifier).not.toBe("EU-DSA");
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
