# FlowPilot AI Cost Accounting Methodology & Pricing Integrity

## 1. Executive Summary

FlowPilot implements a reproducible, version-controlled pricing engine (`AIPricingManager` in `src/core/analytics/pricing.ts`) to estimate the monetary cost of LLM inference across multi-provider deployments.

Rather than applying a static, hardcoded multiplier across all historical records, FlowPilot resolves the **specific pricing tier that was active at the exact timestamp when each AI request occurred**.

---

## 2. Mathematical Cost Formulation

The estimated cost of an individual AI invocation $k$ is calculated as:

$$\text{Cost}_k = \left(\frac{T_{\text{prompt}}}{1,000,000} \times P_{\text{input}}(M, V, t)\right) + \left(\frac{T_{\text{completion}}}{1,000,000} \times P_{\text{output}}(M, V, t)\right)$$

Where:
* $T_{\text{prompt}}$ is the count of prompt/input tokens.
* $T_{\text{completion}}$ is the count of generated completion/output tokens.
* $P_{\text{input}}(M, V, t)$ is the input price per million tokens for model $M$ under pricing version $V$ effective at request timestamp $t$.
* $P_{\text{output}}(M, V, t)$ is the output price per million tokens for model $M$ under pricing version $V$ effective at request timestamp $t$.

---

## 3. Versioned Historical Registry

Pricing tiers are immutable once published. When a provider adjusts pricing, a new tier is registered with an `effectiveFrom` date:

```typescript
export interface ModelPricingTier {
  provider: AIProviderId;
  model: string;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  currency: 'USD';
  effectiveFrom: string; // ISO 8601 date string
  pricingVersion: string; // e.g. "2026-Q1"
}
```

### Current Active Tier Catalog (Version `2026-Q1`):
| Provider | Model | Input Price ($/1M) | Output Price ($/1M) | Effective From | Pricing Version |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **OpenAI** | `gpt-4o-mini` | \$0.15 | \$0.60 | `2026-01-01` | `2026-Q1` |
| **OpenAI** | `gpt-4o` | \$2.50 | \$10.00 | `2026-01-01` | `2026-Q1` |
| **OpenAI** | `gpt-4-turbo` | \$10.00 | \$30.00 | `2026-01-01` | `2026-Q1` |
| **Anthropic** | `claude-3-5-sonnet-latest` | \$3.00 | \$15.00 | `2026-01-01` | `2026-Q1` |
| **Anthropic** | `claude-3-haiku` | \$0.80 | \$4.00 | `2026-01-01` | `2026-Q1` |
| **Gemini** | `gemini-2.0-flash` | \$0.10 | \$0.40 | `2026-01-01` | `2026-Q1` |
| **Gemini** | `gemini-1.5-pro` | \$1.25 | \$5.00 | `2026-01-01` | `2026-Q1` |
| **Mock** | `flowpilot-mock-v1` | \$0.00 | \$0.00 | `2026-01-01` | `2026-Q1` |

---

## 4. Unpriced & Missing Tier Safeguards

> [!CAUTION]
> **Zero-Cost Substitution Prohibited**
> If an AI invocation uses a model or provider that does not have an active pricing tier registered for its timestamp:
> 1. The engine **MUST NOT** substitute \$0.00.
> 2. `isPricingAvailable` is set to `false`.
> 3. `estimatedCostUsd` is reported as `null` (rendered as `N/A` or `Pricing Unavailable` in user interfaces).
> 4. The overview summary flags `hasMissingPricingTiers = true` and increments `unpricedRequestsCount`.

Substituting missing pricing with zero produces deceptively low cost figures that violate accounting integrity.

---

## 5. Advisory Cost vs. External Provider Invoices

> [!IMPORTANT]
> **Advisory Estimation Boundary**
> FlowPilot explicitly presents all monetary AI figures as **advisory estimated projections**, not official billing statements.
>
> Actual monthly invoices issued by OpenAI, Google Cloud, Anthropic, or Groq may differ due to:
> * Prompt caching discounts (e.g. Gemini cached content, OpenAI prompt cache hits).
> * Batch API discounts (e.g. 50% discount for asynchronous batch requests).
> * Enterprise volume tiering and committed-use discounts (CUDs).
> * Minimum billing granularities and currency conversion fees.
>
> Every user-facing AI analytics screen and API response displays the mandatory platform advisory disclaimer.
